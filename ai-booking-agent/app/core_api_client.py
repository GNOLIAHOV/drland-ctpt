import os
from typing import Any, Dict, Optional
from dotenv import load_dotenv
import requests

load_dotenv()


class CoreApiClient:
    """
    HTTP Client giao tiếp với `core-api` (NestJS).
    Tuyệt đối không kết nối trực tiếp vào DB; mọi thao tác đều đi qua REST API.
    """

    def __init__(self, base_url: Optional[str] = None, timeout: int = 10) -> None:
        raw_url = base_url or os.getenv("CORE_API_BASE_URL", "http://localhost:3001")
        self.base_url = raw_url.rstrip("/")
        self.timeout = timeout

    def _extract_error_message(self, response: requests.Response) -> str:
        try:
            data = response.json()
            msg = data.get("message")
            if isinstance(msg, list):
                return "; ".join(str(item) for item in msg)
            if isinstance(msg, str) and msg.strip():
                return msg
        except ValueError:
            pass
        return response.text or f"HTTP {response.status_code}"

    def search_properties(self, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Gọi GET /properties từ core-api.
        Trả về {"success": True, "data": [...], "meta": {...}} hoặc {"success": False, "error": "..."}.
        """
        url = f"{self.base_url}/properties"
        clean_params = {k: v for k, v in (params or {}).items() if v is not None}

        try:
            resp = requests.get(url, params=clean_params, timeout=self.timeout)
            if resp.status_code == 200:
                body = resp.json()
                return {
                    "success": True,
                    "data": body.get("data", []),
                    "meta": body.get("meta", {}),
                }
            return {
                "success": False,
                "status_code": resp.status_code,
                "error": self._extract_error_message(resp),
            }
        except requests.RequestException as exc:
            return {
                "success": False,
                "error": f"Không thể kết nối tới core-api ({url}): {exc}",
            }

    def get_houses(self) -> Dict[str, Any]:
        """
        Gọi GET /houses từ core-api để lấy danh sách tòa nhà/cơ sở hiện hành.
        """
        url = f"{self.base_url}/houses"
        try:
            resp = requests.get(url, timeout=self.timeout)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "success": True,
                    "data": data if isinstance(data, list) else [],
                }
            return {
                "success": False,
                "status_code": resp.status_code,
                "error": self._extract_error_message(resp),
            }
        except requests.RequestException as exc:
            return {
                "success": False,
                "error": f"Không thể kết nối tới core-api ({url}): {exc}",
            }

    def get_public_settings(self) -> Dict[str, Any]:
        """
        Gọi GET /settings/public từ core-api để lấy hotline, zalo và tên thương hiệu.
        """
        url = f"{self.base_url}/settings/public"
        try:
            resp = requests.get(url, timeout=self.timeout)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "success": True,
                    "data": data if isinstance(data, dict) else {},
                }
            return {
                "success": False,
                "status_code": resp.status_code,
                "error": self._extract_error_message(resp),
            }
        except requests.RequestException as exc:
            return {
                "success": False,
                "error": f"Không thể kết nối tới core-api ({url}): {exc}",
            }

    def create_booking(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Gọi POST /bookings tới core-api.
        Bắt các mã lỗi 400 (phòng đã cho thuê / dữ liệu không hợp lệ),
        404 (không tìm thấy phòng), 429 (Rate Limit - gửi quá nhiều yêu cầu)
        và trả về {"success": False, "error": "..."} mà không quăng Exception.
        """
        url = f"{self.base_url}/bookings"

        try:
            resp = requests.post(url, json=payload, timeout=self.timeout)
            if resp.status_code in (200, 201):
                return {
                    "success": True,
                    "data": resp.json(),
                }

            detail = self._extract_error_message(resp)
            if resp.status_code == 429:
                return {
                    "success": False,
                    "status_code": 429,
                    "error": (
                        "Hệ thống đang nhận quá nhiều yêu cầu đặt lịch (Rate Limit 429). "
                        "Vui lòng đợi khoảng 1 phút rồi thử lại."
                    ),
                }
            if resp.status_code == 400:
                return {
                    "success": False,
                    "status_code": 400,
                    "error": f"Không thể đặt lịch (400): {detail}",
                }
            if resp.status_code == 404:
                return {
                    "success": False,
                    "status_code": 404,
                    "error": f"Không tìm thấy phòng yêu cầu (404): {detail}",
                }

            return {
                "success": False,
                "status_code": resp.status_code,
                "error": f"Lỗi từ hệ thống core-api (HTTP {resp.status_code}): {detail}",
            }
        except requests.RequestException as exc:
            return {
                "success": False,
                "error": f"Không thể kết nối tới core-api ({url}): {exc}",
            }
