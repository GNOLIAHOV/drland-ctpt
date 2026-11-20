from datetime import datetime, timedelta, timezone
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from dotenv import load_dotenv
from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core_api_client import CoreApiClient
from app.tools import (
    book_appointment_tool,
    current_human_texts_var,
    current_session_id_var,
    get_landlord_phones,
    get_session_bookings,
    normalize_phone,
    search_properties_tool,
)

VN_TZ = timezone(timedelta(hours=7))


def get_vn_now() -> datetime:
    return datetime.now(VN_TZ)

load_dotenv()
logger = logging.getLogger("ai_agent")

TOOLS = [search_properties_tool, book_appointment_tool]
core_client = CoreApiClient()

CANDIDATE_MODELS: List[str] = [
    os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
]

_executors_cache: Dict[Tuple[str, str, str, str], AgentExecutor] = {}


def get_live_contact_hotline() -> str:
    """
    Lấy số Hotline / Zalo hiện hành từ core-api (/settings/public).
    """
    res = core_client.get_public_settings()
    data = res.get("data", {}) if res.get("success") else {}
    hotline = str(data.get("hotline") or "").strip() if isinstance(data, dict) else ""
    return hotline or "0943.257.089"


def get_live_houses_summary() -> str:
    """
    Lấy danh sách tên và địa chỉ các tòa nhà/cơ sở hiện hành trực tiếp từ core-api.
    """
    res = core_client.get_houses()
    houses = res.get("data", []) if res.get("success") else []
    parts: List[str] = []
    for h in houses:
        if not isinstance(h, dict):
            continue
        name = str(h.get("name") or "").strip()
        address = str(h.get("address") or "").strip()
        if name and address:
            parts.append(f"{name}: {address}")
        elif address:
            parts.append(address)
        elif name:
            parts.append(name)
    return "; ".join(parts) if parts else "TP.HCM"


def extract_text_output(raw_output: Any) -> str:
    """
    Chuẩn hóa trường `output` từ AgentExecutor thành chuỗi văn bản thuần túy
    (hỗ trợ cả trường hợp Gemini trả về list các content blocks).
    """
    if isinstance(raw_output, str):
        return raw_output
    if isinstance(raw_output, list):
        parts = []
        for item in raw_output:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
        return "\n".join(parts).strip()
    return str(raw_output)


def get_agent_executor(model_name: str) -> AgentExecutor:
    now_vn = get_vn_now()
    today = now_vn.date()
    tomorrow = today + timedelta(days=1)
    houses_summary = get_live_houses_summary()
    hotline = get_live_contact_hotline()
    cache_key = (model_name, today.isoformat(), houses_summary, hotline)

    if cache_key in _executors_cache:
        return _executors_cache[cache_key]

    api_key = os.getenv("GEMINI_API_KEY")

    llm = ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=0.2,
        max_retries=2,
    )

    system_prompt = (
        "Bạn là Quản lý Dịch vụ cho thuê phòng trọ và mặt bằng DRLAND.\n"
        f"Hệ thống gồm các cơ sở đang hoạt động: {houses_summary}.\n"
        f"Hotline / Zalo hỗ trợ: {hotline}.\n"
        f"Thời gian hiện tại: Hôm nay là {today.strftime('%d/%m/%Y')} (Ngày mai là {tomorrow.strftime('%d/%m/%Y')}).\n\n"
        "── PHONG CÁCH TƯ VẤN BÁN HÀNG CHUYÊN NGHIỆP ──\n"
        "1. Thân thiện, chu đáo, lễ phép: Xưng 'Em' và gọi khách là 'Anh/Chị'. Tuyệt đối KHÔNG xưng 'Tôi là AI' hay nói câu máy móc.\n"
        "2. TUYỆT ĐỐI KHÔNG LÀM KHÁCH BỊ RỐI HOẶC NGỢP THÔNG TIN:\n"
        "   - CẤM TUYỆT ĐỐI hiển thị mã ID/UUID kỹ thuật (như `[ID: ...]`). Khách hàng chỉ nhìn thấy Mã phòng quen thuộc như P101, P202, P303, MB-14B9.\n"
        "   - Trường `id` (UUID) chỉ được lưu ngầm trong bộ nhớ của bạn để dùng khi gọi `book_appointment_tool`.\n"
        "   - Giới thiệu ngắn gọn, rõ ràng các căn đang trống (tối đa 3-4 căn). Nếu khách hỏi chung hoặc hỏi có nhắc tới 'mặt bằng' / 'kinh doanh', hãy giới thiệu đầy đủ cả phòng trọ đang trống lẫn mặt bằng kinh doanh đang trống (như MB-14B9).\n"
        "   - Mỗi căn chỉ tóm tắt 2-3 dòng cô đọng: Mã & Tên, Cơ sở/Địa chỉ (`houseName` / `address`), Diện tích, Giá thuê (luôn định dạng đẹp như 3.500.000 đ/tháng) và 1 điểm nổi bật nhất.\n"
        "   - Chi phí phụ chỉ gom ngắn gọn: Điện 3.800 đ/kWh, nước 20.000 đ/m³, phí dịch vụ 50.000 đ/tháng (mặt bằng 100.000 đ/tháng), cọc 1 tháng (mặt bằng cọc 2 tháng).\n"
        "   - Nếu khách chỉ hỏi riêng 'phòng trọ để ở' thì ưu tiên giới thiệu phòng trọ; nếu khách hỏi chung hoặc hỏi về mặt bằng/kinh doanh thì giới thiệu cả mặt bằng kinh doanh đang trống.\n"
        "   - TUYỆT ĐỐI KHÔNG dùng cú pháp Markdown như dấu sao **in đậm** hay ### tiêu đề. Hãy viết văn bản thuần túy tự nhiên như người thật nhắn tin Zalo.\n"
        "3. TƯƠNG TÁC 2 CHIỀU (LẮNG NGHE NHU CẦU):\n"
        "   - Sau khi giới thiệu ngắn gọn, luôn hỏi 1 câu gợi mở tự nhiên: 'Anh/Chị dự kiến tìm phòng cho mấy người ở, ưu tiên cơ sở nào và khoảng tài chính tầm bao nhiêu để em lọc căn ưng ý nhất cho mình ạ?' hoặc 'Anh/Chị có tiện ghé xem phòng thực tế chiều nay hay ngày mai không em đón tiếp mình nhé?'\n"
        "   - Nếu khách muốn xem ảnh, nhắc nhẹ: 'Anh/Chị có thể bấm trực tiếp vào ảnh từng phòng trên trang web để xem trọn bộ ảnh thực tế ạ.'\n\n"
        "── NHIỆM VỤ ĐẶT LỊCH HẸN XEM PHÒNG ──\n"
        "1. BẮT BUỘC phải thu thập ĐỦ 4 thông tin THẬT do chính khách cung cấp mới được gọi `book_appointment_tool`: "
        "(1) Mã phòng muốn xem (dùng UUID tương ứng trong kết quả tìm kiếm), (2) Tên thật của khách hàng, (3) Số điện thoại riêng của khách hàng, và (4) Thời gian ghé xem.\n"
        "2. CẤM TUYỆT ĐỐI gọi `book_appointment_tool` sớm khi chưa có Tên thật HOẶC chưa có Số điện thoại của khách:\n"
        f"   - CẤM tự bịa đại từ chung ('Anh/Chị', 'Khách hàng', 'Chưa rõ') làm tên khách, và CẤM lấy Hotline/Zalo DRLAND ({hotline}) điền thay số điện thoại khách.\n"
        "   - Nếu khách mới nói giờ xem (VD: 'Ngày mai 2h chiều qua xem') mà chưa nói Tên hoặc SĐT, CHỈ hỏi xin nhẹ nhàng Tên và SĐT của khách; TUYỆT ĐỐI KHÔNG nói là 'đã ghi nhận lịch hẹn' hay 'đã lưu vào hệ thống'.\n"
        f"3. Nếu khách nói thời gian tương đối như 'chiều mai 2h', 'sáng mai 9h', tự quy đổi sang ISO 8601 giờ Việt Nam theo định dạng `YYYY-MM-DDTHH:MM:00+07:00` (VD: '{tomorrow.isoformat()}T14:00:00+07:00') cho `appointment_time`. Chỉ truyền `message` khi khách có ghi chú/yêu cầu riêng (không cần lặp lại giờ hẹn trong `message`).\n"
        f"4. CẤM GỌI LẶP `book_appointment_tool`: Khi lịch hẹn đã chốt thành công ở lượt trước mà khách chỉ nhắn phản hồi xác nhận ngắn ('Ok', 'Dạ', 'Cảm ơn', 'Rồi ạ', 'Ừ'), TUYỆT ĐỐI KHÔNG gọi lại tool đặt lịch nữa — chỉ đáp lại ngắn gọn, niềm nở và nhắc hotline hỗ trợ khi tới nơi. Nếu khách muốn hủy lịch hẹn đã đặt, hãy hướng dẫn lịch sự liên hệ trực tiếp Hotline/Zalo {hotline} và KHÔNG gọi lại `book_appointment_tool`. Chỉ gọi lại tool khi khách yêu cầu đổi giờ/ngày hoặc muốn đặt thêm một phòng khác.\n"
        f"5. Sau khi tool trả về đặt lịch thành công, xác nhận lại lịch hẹn vui vẻ, nhắc lại đúng giờ hẹn, địa chỉ cơ sở phòng đã chọn (thuộc hệ thống DRLAND: {houses_summary}) và hotline {hotline}."
    )

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            ("system", "{session_booking_status}"),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ]
    )

    agent = create_tool_calling_agent(llm=llm, tools=TOOLS, prompt=prompt)
    executor = AgentExecutor(agent=agent, tools=TOOLS, verbose=True)
    if len(_executors_cache) > 12:
        _executors_cache.clear()
    _executors_cache[cache_key] = executor
    return executor


def format_currency(val: Any) -> str:
    try:
        n = int(float(val))
        return f"{n:,.0f} đ".replace(",", ".")
    except Exception:
        return str(val)


def generate_autonomous_fallback(user_message: str) -> str:
    """
    Kịch bản dự phòng thông minh khi toàn bộ model AI bên ngoài tạm thời hết quota.
    Tra cứu trực tiếp dữ liệu phòng thực tế từ core-api và phản hồi chu đáo với tư cách Quản lý DRLAND.
    """
    houses_summary = get_live_houses_summary()
    hotline = get_live_contact_hotline()
    props_res = core_client.search_properties({"limit": 10})
    properties = props_res.get("data", []) if props_res.get("success") else []

    msg_lower = user_message.lower()
    wants_commercial = any(
        k in msg_lower for k in ("mặt bằng", "mat bang", "kinh doanh", "cửa hàng", "shop", "mb")
    )
    wants_room = any(k in msg_lower for k in ("phòng", "phong", "trọ", "tro", "ở"))
    only_commercial = wants_commercial and not wants_room
    only_room = wants_room and not wants_commercial

    available_units = [
        p for p in properties
        if p.get("status") in ("AVAILABLE", "SOON_TO_BE_AVAILABLE")
        and (
            (only_commercial and p.get("type") == "COMMERCIAL_SPACE")
            or (only_room and p.get("type") == "ROOM")
            or (not only_commercial and not only_room)
        )
    ]

    # Kiểm tra xem khách có để lại số điện thoại đặt lịch không
    phone_match = re.search(r"(0[3|5|7|8|9]\d{8})", user_message)
    if phone_match:
        phone = phone_match.group(1)
        if normalize_phone(phone) in get_landlord_phones():
            return (
                f"Dạ đó là số Hotline của hệ thống DRLAND rồi ạ. "
                "Anh/Chị vui lòng để lại số điện thoại riêng và tên của mình để em xếp lịch đón tiếp chu đáo nhất nhé!"
            )
        # Tự động tạo booking với căn trống đầu tiên nếu có
        target_property = available_units[0] if available_units else (properties[0] if properties else None)
        if target_property:
            tomorrow_noon = (get_vn_now().date() + timedelta(days=1)).strftime("%Y-%m-%dT15:00:00+07:00")
            booking_res = core_client.create_booking({
                "propertyId": target_property.get("id"),
                "guestName": "Khách Đặt Qua Web",
                "phoneNumber": phone,
                "appointmentTime": tomorrow_noon,
                "message": f"Tin nhắn khách: {user_message}",
                "source": "AI_CHAT_FALLBACK",
            })
            if booking_res.get("success"):
                prop_addr = target_property.get("address") or houses_summary
                prop_code = target_property.get("code", "")
                return (
                    f"Dạ em đã ghi nhận lịch hẹn xem ({prop_code}) của Anh/Chị qua số điện thoại {phone} rồi ạ!\n\n"
                    f"Địa chỉ đón tiếp: {prop_addr}.\n"
                    f"Quản lý nhà sẽ gọi lại xác nhận ngay để chuẩn bị đón Anh/Chị chu đáo nhất.\n"
                    f"Nếu cần hỗ trợ gấp, Anh/Chị gọi trực tiếp Hotline/Zalo: {hotline} nhé ạ!"
                )
            logger.warning("Fallback create_booking thất bại: %s", booking_res.get("error"))
            return (
                f"Dạ em đã tiếp nhận số điện thoại {phone} của Anh/Chị. "
                f"Để chốt nhanh khung giờ và cơ sở xem phù hợp ({houses_summary}), "
                f"Anh/Chị gọi trực tiếp Hotline/Zalo: {hotline} để quản lý hỗ trợ ngay nhé ạ!"
            )

    # Nếu khách hỏi thông tin phòng & mặt bằng chung
    if available_units:
        intro_lines = [
            f"Dạ chào Anh/Chị! Hệ thống nhà trọ và mặt bằng DRLAND ({houses_summary}) hiện đang có các căn trống sẵn sàng đón mình:\n"
        ]
        for unit in available_units[:4]:
            code = unit.get("code", "")
            name = unit.get("name", "")
            house_name = (unit.get("house") or {}).get("name")
            location = house_name or unit.get("address") or ""
            rent = format_currency(unit.get("monthlyRent", 0))
            area = unit.get("area", "")
            loc_suffix = f" ({location})" if location else ""
            unit_label = "Mặt bằng" if unit.get("type") == "COMMERCIAL_SPACE" else "Phòng"
            intro_lines.append(f"• {unit_label} {code} ({name}){loc_suffix}: Diện tích {area}m², giá thuê {rent}/tháng.")

        intro_lines.append(
            "\nAnh/Chị có thể bấm trực tiếp vào ảnh từng căn trên trang web để xem trọn bộ ảnh thực tế, "
            f"hoặc nhắn số điện thoại / gọi Hotline {hotline} để em xếp lịch đón tiếp mình ghé xem hôm nay nhé ạ!"
        )
        return "\n".join(intro_lines)

    return (
        f"Dạ chào Anh/Chị! Em là quản lý hệ thống nhà trọ DRLAND ({houses_summary}).\n\n"
        f"Anh/Chị vui lòng để lại số điện thoại hoặc gọi trực tiếp Hotline / Zalo: {hotline} "
        "để em hỗ trợ tư vấn chi tiết và xếp lịch đón tiếp mình ghé xem trực tiếp nhé ạ!"
    )


def build_session_booking_status(session_id: Optional[str]) -> str:
    """
    Tạo đoạn ngữ cảnh hệ thống cho LLM biết các lịch hẹn đã được chốt trong phiên chat hiện tại
    để tránh gọi lặp `book_appointment_tool` khi khách chỉ nhắn xác nhận ngắn ('Ok', 'Cảm ơn').
    """
    bookings = get_session_bookings(session_id)
    if not bookings:
        return "Trạng thái đặt lịch trong phiên hiện tại: Chưa có lịch hẹn nào được tạo."

    lines = ["Trạng thái đặt lịch trong phiên hiện tại — LỊCH HẸN ĐÃ ĐƯỢC CHỐT THÀNH CÔNG:"]
    for b in bookings:
        hour_part = f" lúc {b['appointmentHour']}" if b.get("appointmentHour") else ""
        lines.append(
            f"- Khách: {b.get('guestName')} | SĐT: {b.get('phoneNumber')} | "
            f"Ngày hẹn: {b.get('appointmentTime')}{hour_part} | "
            f"PropertyId: {b.get('propertyId')} | BookingId: {b.get('bookingId')}"
        )
    lines.append(
        "LƯU Ý BẮT BUỘC: Lịch hẹn trên ĐÃ LƯU trong hệ thống. "
        "TUYỆT ĐỐI KHÔNG gọi lại `book_appointment_tool` nếu khách chỉ nhắn xác nhận ngắn "
        "('Ok', 'Dạ', 'Cảm ơn', 'Rồi ạ'). Chỉ gọi lại khi khách yêu cầu đổi ngày/giờ hoặc đặt sang phòng khác."
    )
    return "\n".join(lines)


def execute_agent_chat(
    user_message: str,
    chat_history: list,
    session_id: Optional[str] = None,
) -> str:
    """
    Thực thi hội thoại với chiến lược Failover nhiều tầng:
    1. Thử lần lượt các model Gemini (gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> ...)
    2. Nếu dính 429 RESOURCE_EXHAUSTED hoặc 503, tự động chuyển sang model tiếp theo.
    3. Nếu tất cả model AI đều quá tải hoặc rớt mạng, kích hoạt Kịch bản dự phòng thông minh (Fallback)
       tra cứu dữ liệu thực tế từ core-api và trả lời khách hàng chu đáo.
    """
    last_error: Optional[Exception] = None
    session_status = build_session_booking_status(session_id)
    human_texts = [
        str(m.content) for m in chat_history if isinstance(m, HumanMessage)
    ] + [user_message]
    token = current_session_id_var.set(session_id)
    human_token = current_human_texts_var.set(human_texts)

    try:
        for model_name in CANDIDATE_MODELS:
            try:
                executor = get_agent_executor(model_name)
                result = executor.invoke({
                    "input": user_message,
                    "chat_history": chat_history,
                    "session_booking_status": session_status,
                })
                output = extract_text_output(result.get("output", ""))
                if output.strip():
                    return output
            except Exception as exc:
                err_str = str(exc)
                last_error = exc
                logger.warning("Model %s gặp lỗi: %s. Đang chuyển model dự phòng...", model_name, err_str)
                # Nếu là lỗi quota (429) hoặc tạm thời quá tải (503), tiếp tục thử model tiếp theo
                if any(k in err_str for k in ("429", "RESOURCE_EXHAUSTED", "quota", "503", "demand")):
                    continue
                # Các lỗi khác vẫn thử tiếp model dự phòng
                continue
    finally:
        current_human_texts_var.reset(human_token)
        current_session_id_var.reset(token)

    # Khi toàn bộ AI models đều bất khả dụng
    logger.error("Toàn bộ AI models đều quá tải quota: %s. Chuyển sang kịch bản Autonomous Fallback.", last_error)
    return generate_autonomous_fallback(user_message)
