from contextvars import ContextVar
import json
import re
from typing import Any, Dict, List, Literal, Optional, Set
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.core_api_client import CoreApiClient

client = CoreApiClient()

current_session_id_var: ContextVar[Optional[str]] = ContextVar(
    "current_session_id", default=None
)
current_human_texts_var: ContextVar[Optional[List[str]]] = ContextVar(
    "current_human_texts", default=None
)
_session_bookings: Dict[str, List[Dict[str, Any]]] = {}
_MAX_SESSION_CACHE = 500
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

_PLACEHOLDER_GUEST_NAMES: Set[str] = {
    "anh/chị",
    "anh/chi",
    "anh chị",
    "anh chi",
    "anh",
    "chị",
    "chi",
    "em",
    "bạn",
    "ban",
    "quý khách",
    "quy khach",
    "khách",
    "khach",
    "khách hàng",
    "khach hang",
    "quý anh/chị",
    "quy anh/chi",
    "chưa rõ",
    "chua ro",
    "không rõ",
    "khong ro",
    "chưa có",
    "chua co",
    "chưa cung cấp",
    "chua cung cap",
    "tên khách",
    "ten khach",
    "họ tên",
    "ho ten",
    "họ và tên",
    "ho va ten",
    "khách xem phòng",
    "khach xem phong",
    "khách đặt lịch",
    "khach dat lich",
    "khách thuê",
    "khach thue",
    "người thuê",
    "nguoi thue",
    "quý khách hàng",
    "quy khach hang",
    "anh/chị khách",
    "anh/chi khach",
    "chưa biết",
    "chua biet",
    "chưa có tên",
    "chua co ten",
    "không có tên",
    "khong co ten",
    "anonymous",
    "unknown",
    "guest",
    "customer",
    "user",
    "client",
    "none",
    "null",
    "n/a",
    "na",
}


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("84"):
        return f"0{digits[2:]}"
    return digits


def is_placeholder_guest_name(name: str) -> bool:
    normalized = re.sub(r"\s+", " ", (name or "").strip().lower())
    normalized = re.sub(r"\s*/\s*", "/", normalized)
    normalized = re.sub(r"^[\W_]+|[\W_]+$", "", normalized)
    if (
        len(normalized) < 2
        or normalized.isdigit()
        or bool(re.fullmatch(r"[\d\s.+\-()]+", normalized))
    ):
        return True
    return normalized in _PLACEHOLDER_GUEST_NAMES


def phone_appeared_in_texts(norm_phone: str, texts: List[str]) -> bool:
    if not norm_phone:
        return False
    patterns = [re.compile(r"[\s.\-]*".join(re.escape(c) for c in norm_phone))]
    if norm_phone.startswith("0"):
        intl = "84" + norm_phone[1:]
        patterns.append(re.compile(r"[\s.\-]*".join(re.escape(c) for c in intl)))

    for text in texts:
        text_str = str(text or "")
        if any(rx.search(text_str) for rx in patterns):
            return True
    return False


def _resolve_property_id(raw_property_id: str) -> str:
    clean = (raw_property_id or "").strip()
    if not clean or _UUID_RE.match(clean):
        return clean

    target_code = clean.upper()
    res = client.search_properties({"limit": 50})
    props = res.get("data", []) if res.get("success") else []
    for prop in props:
        if not isinstance(prop, dict):
            continue
        code = str(prop.get("code") or "").strip().upper()
        if code == target_code and prop.get("id"):
            return str(prop["id"])
    return clean


def get_landlord_phones() -> Set[str]:
    phones: Set[str] = set()
    res = client.get_public_settings()
    data = res.get("data", {}) if res.get("success") else {}
    if isinstance(data, dict):
        for field in ("hotline", "hotlineDigits", "zaloPhone"):
            val = normalize_phone(str(data.get(field) or ""))
            if val:
                phones.add(val)
    return phones or {"0943257089"}


def extract_appointment_hour(iso_str: str) -> Optional[str]:
    match = re.search(r"[T ](\d{2}):(\d{2})", iso_str or "")
    if not match:
        return None
    hh = int(match.group(1))
    mm = int(match.group(2))
    if hh < 0 or hh > 23 or mm < 0 or mm > 59 or (hh == 0 and mm == 0):
        return None
    return f"{match.group(1)}:{match.group(2)}"


def merge_hour_into_message(
    message: Optional[str], hour: Optional[str]
) -> Optional[str]:
    clean = (message or "").strip() or None
    if not hour:
        return clean
    if clean and re.search(r"Giờ hẹn:\s*\d{2}:\d{2}", clean, re.IGNORECASE):
        return re.sub(
            r"Giờ hẹn:\s*\d{2}:\d{2}",
            f"Giờ hẹn: {hour}",
            clean,
            count=1,
            flags=re.IGNORECASE,
        )
    return f"Giờ hẹn: {hour} — {clean}" if clean else f"Giờ hẹn: {hour}"


def get_session_bookings(session_id: Optional[str]) -> List[Dict[str, Any]]:
    if not session_id:
        return []
    return list(_session_bookings.get(session_id, []))


def clear_session_bookings(session_id: Optional[str] = None) -> None:
    if session_id is None:
        _session_bookings.clear()
    else:
        _session_bookings.pop(session_id, None)


def _upsert_session_booking(session_id: str, record: Dict[str, Any]) -> None:
    if session_id not in _session_bookings and len(_session_bookings) >= _MAX_SESSION_CACHE:
        oldest_key = next(iter(_session_bookings))
        _session_bookings.pop(oldest_key, None)

    records = _session_bookings.setdefault(session_id, [])
    for idx, item in enumerate(records):
        if (
            item.get("propertyId") == record.get("propertyId")
            and item.get("normalizedPhone") == record.get("normalizedPhone")
            and item.get("appointmentDate") == record.get("appointmentDate")
        ):
            records[idx] = record
            return
    records.append(record)


class SearchPropertiesInput(BaseModel):
    property_type: Optional[Literal["ROOM", "COMMERCIAL_SPACE"]] = Field(
        default=None,
        description=(
            "Loại bất động sản cần tìm: 'ROOM' (chỉ khi khách CHỈ tìm phòng trọ ở) hoặc "
            "'COMMERCIAL_SPACE' (chỉ khi khách CHỈ tìm mặt bằng kinh doanh). "
            "BẮT BUỘC để trống (None) nếu khách hỏi chung hoặc hỏi cả phòng lẫn mặt bằng."
        ),
    )
    min_rent: Optional[float] = Field(
        default=None,
        ge=0,
        description="Giá thuê tối thiểu mỗi tháng (VNĐ).",
    )
    max_rent: Optional[float] = Field(
        default=None,
        ge=0,
        description="Giá thuê tối đa mỗi tháng (VNĐ).",
    )
    include_soon_available: bool = Field(
        default=True,
        description=(
            "Nếu True (mặc định), kết quả bao gồm cả phòng đang trống (AVAILABLE) "
            "và phòng sắp trống (SOON_TO_BE_AVAILABLE)."
        ),
    )


class BookAppointmentInput(BaseModel):
    property_id: str = Field(
        ...,
        description="UUID của phòng cần đặt lịch xem (lấy từ trường 'id' trong kết quả tìm kiếm trước đó).",
    )
    guest_name: str = Field(
        ...,
        min_length=1,
        description=(
            "Tên thật của khách hàng tự cung cấp (ví dụ: 'Long', 'Anh Long', 'Chị Hoa'). "
            "TUYỆT ĐỐI KHÔNG tự điền đại từ chung hoặc chữ giữ chỗ như 'Anh/Chị', 'Khách hàng', 'Chưa rõ'."
        ),
    )
    phone_number: str = Field(
        ...,
        min_length=8,
        description=(
            "Số điện thoại thật do chính khách hàng cung cấp (8-20 chữ số). "
            "TUYỆT ĐỐI KHÔNG dùng số Hotline/Zalo của chủ nhà DRLAND."
        ),
    )
    appointment_time: str = Field(
        ...,
        description=(
            "Thời gian hẹn xem phòng theo chuẩn ISO 8601 giờ Việt Nam "
            "(ví dụ: '2026-11-21T14:00:00+07:00' hoặc '2026-11-21')."
        ),
    )
    guest_email: Optional[str] = Field(
        default=None,
        description="Địa chỉ email của khách hàng (nếu có).",
    )
    message: Optional[str] = Field(
        default=None,
        description="Ghi chú giờ hẹn chi tiết hoặc lời nhắn thêm của khách hàng (nếu có).",
    )


@tool("search_properties_tool", args_schema=SearchPropertiesInput)
def search_properties_tool(
    property_type: Optional[Literal["ROOM", "COMMERCIAL_SPACE"]] = None,
    min_rent: Optional[float] = None,
    max_rent: Optional[float] = None,
    include_soon_available: bool = True,
) -> str:
    """Sử dụng công cụ này khi khách hàng muốn tìm kiếm, xem danh sách phòng hoặc tra cứu giá cả. Hỗ trợ lọc theo loại, giá min, giá max. Chỉ trả về các phòng đang trống (AVAILABLE) hoặc sắp trống (SOON_TO_BE_AVAILABLE)."""
    base_params = {
        "type": property_type,
        "minRent": min_rent,
        "maxRent": max_rent,
        "limit": 50,
    }

    available_res = client.search_properties({**base_params, "status": "AVAILABLE"})
    if not available_res.get("success"):
        return f"Không thể tra cứu danh sách phòng lúc này: {available_res.get('error')}"

    rooms = list(available_res.get("data", []))

    if include_soon_available:
        soon_res = client.search_properties(
            {**base_params, "status": "SOON_TO_BE_AVAILABLE"}
        )
        if soon_res.get("success"):
            rooms.extend(soon_res.get("data", []))

    if not rooms:
        return "Hiện không tìm thấy phòng hoặc mặt bằng nào đang trống/sắp trống phù hợp với tiêu chí."

    summary = [
        {
            "id": r.get("id"),
            "code": r.get("code"),
            "name": r.get("name"),
            "houseName": (r.get("house") or {}).get("name"),
            "type": r.get("type"),
            "status": r.get("status"),
            "availableFrom": r.get("availableFrom"),
            "address": r.get("address"),
            "area_m2": r.get("area"),
            "monthlyRent_vnd": r.get("monthlyRent"),
            "deposit_vnd": r.get("deposit"),
            "electricityRate_vnd": r.get("electricityRate"),
            "waterRate_vnd": r.get("waterRate"),
            "serviceFee_vnd": r.get("serviceFee"),
            "description": r.get("description"),
            "images": r.get("images", []),
        }
        for r in rooms
    ]
    return json.dumps(
        {"total": len(summary), "properties": summary},
        ensure_ascii=False,
    )


@tool("book_appointment_tool", args_schema=BookAppointmentInput)
def book_appointment_tool(
    property_id: str,
    guest_name: str,
    phone_number: str,
    appointment_time: str,
    guest_email: Optional[str] = None,
    message: Optional[str] = None,
) -> str:
    """Sử dụng công cụ này ĐỂ CHỐT LỊCH HẸN xem phòng. CHỈ GỌI KHI khách hàng đã tự cung cấp đủ 4 thông tin THẬT: propertyId, Tên thật của khách (KHÔNG dùng 'Anh/Chị'), Số điện thoại của khách (KHÔNG dùng hotline DRLAND) và Thời gian hẹn (ISO 8601 giờ Việt Nam, ví dụ '2026-11-21T14:00:00+07:00'). KHÔNG gọi lại nếu lịch hẹn đã chốt trước đó trong cùng phiên chat và khách chỉ nhắn xác nhận ngắn ('Ok', 'Cảm ơn')."""
    if is_placeholder_guest_name(guest_name):
        return (
            "Đặt lịch KHÔNG thành công (CHƯA LƯU VÀO HỆ THỐNG): "
            "Thiếu TÊN THẬT của khách hàng (không được dùng chữ thay thế như 'Anh/Chị', 'Khách hàng'). "
            "Hãy hỏi xin lại Tên và Số điện thoại của khách rồi mới gọi lại tool; tuyệt đối KHÔNG nói là đã lưu hay đã chốt lịch."
        )

    norm_phone = normalize_phone(phone_number)
    if len(norm_phone) < 8 or len(set(norm_phone)) <= 1:
        return (
            "Đặt lịch KHÔNG thành công (CHƯA LƯU VÀO HỆ THỐNG): "
            "Số điện thoại của khách hàng không hợp lệ. Hãy hỏi xin lại số điện thoại thật của khách rồi mới gọi lại tool."
        )

    if norm_phone in get_landlord_phones():
        return (
            "Đặt lịch KHÔNG thành công (CHƯA LƯU VÀO HỆ THỐNG): "
            f"Số {phone_number} là Hotline/Zalo của chủ nhà DRLAND, KHÔNG phải số điện thoại của khách hàng. "
            "Hãy lịch sự hỏi xin số điện thoại riêng của khách trước khi đặt lịch; tuyệt đối KHÔNG nói là đã lưu hay đã chốt lịch."
        )

    human_texts = current_human_texts_var.get()
    if human_texts is not None and not phone_appeared_in_texts(norm_phone, human_texts):
        return (
            "Đặt lịch KHÔNG thành công (CHƯA LƯU VÀO HỆ THỐNG): "
            "Khách hàng chưa cung cấp số điện thoại này trong cuộc trò chuyện. "
            "Tuyệt đối KHÔNG tự bịa số điện thoại; hãy hỏi xin số điện thoại thật của khách hàng."
        )

    resolved_property_id = _resolve_property_id(property_id)
    clean_appt_time = (appointment_time or "").strip()
    appt_date = clean_appt_time[:10]
    appt_hour = extract_appointment_hour(clean_appt_time)
    final_message = merge_hour_into_message(message, appt_hour)

    session_id = current_session_id_var.get()
    if session_id:
        for existing in _session_bookings.get(session_id, []):
            if (
                existing.get("propertyId") == resolved_property_id
                and existing.get("normalizedPhone") == norm_phone
                and existing.get("appointmentDate") == appt_date
                and (not appt_hour or appt_hour == existing.get("appointmentHour"))
            ):
                return json.dumps(
                    {
                        "alreadyBooked": True,
                        "message": "Lịch hẹn này đã được đặt thành công trước đó trong phiên chat này rồi. KHÔNG cần đặt lại; hãy xác nhận ngắn gọn và chào khách lịch sự.",
                        "bookingId": existing.get("bookingId"),
                        "propertyId": existing.get("propertyId"),
                        "guestName": existing.get("guestName"),
                        "phoneNumber": existing.get("phoneNumber"),
                        "appointmentTime": existing.get("appointmentTime"),
                        "appointmentHour": existing.get("appointmentHour"),
                        "status": existing.get("status"),
                    },
                    ensure_ascii=False,
                )

    payload: Dict[str, Any] = {
        "propertyId": resolved_property_id,
        "guestName": guest_name.strip(),
        "phoneNumber": norm_phone,
        "appointmentTime": clean_appt_time,
    }
    if guest_email:
        payload["guestEmail"] = guest_email
    if final_message:
        payload["message"] = final_message

    result = client.create_booking(payload)
    if not result.get("success"):
        return f"Đặt lịch KHÔNG thành công: {result.get('error')}"

    booking = result.get("data", {})
    if session_id:
        _upsert_session_booking(
            session_id,
            {
                "bookingId": booking.get("id"),
                "propertyId": booking.get("propertyId") or resolved_property_id,
                "guestName": booking.get("guestName") or guest_name.strip(),
                "phoneNumber": booking.get("phoneNumber") or norm_phone,
                "normalizedPhone": norm_phone,
                "appointmentDate": appt_date,
                "appointmentHour": appt_hour,
                "appointmentTime": booking.get("appointmentTime") or appt_date,
                "message": booking.get("message") or final_message,
                "status": booking.get("status") or "PENDING",
            },
        )

    return json.dumps(
        {
            "message": "Đặt lịch hẹn xem phòng thành công!",
            "bookingId": booking.get("id"),
            "propertyId": booking.get("propertyId"),
            "guestName": booking.get("guestName"),
            "phoneNumber": booking.get("phoneNumber"),
            "appointmentTime": booking.get("appointmentTime"),
            "appointmentHour": appt_hour,
            "status": booking.get("status"),
        },
        ensure_ascii=False,
    )
