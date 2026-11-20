"""
Offline unit tests cho guardrail đặt lịch của AI Booking Agent:
- Chặn tên giữ chỗ ('Anh/Chị', 'Khách hàng', 'Chưa rõ', 'Guest')
- Cho phép tên khách thật ('Long', 'Anh Long', 'Nguyễn Văn Khách', 'Khách Spam 0')
- Chặn số Hotline/Zalo của chủ nhà (kể cả dạng có dấu chấm hoặc +84)
- Lưu giờ hẹn ('14:00') vào message khi gọi core-api
- Chống gọi lặp trong cùng session_id (trả về alreadyBooked: true)
- Cho phép cập nhật lại giờ hẹn khi khách đổi giờ trong cùng phiên
"""
import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.agent import build_session_booking_status  # noqa: E402
from app.tools import (  # noqa: E402
    book_appointment_tool,
    clear_session_bookings,
    current_human_texts_var,
    current_session_id_var,
    is_placeholder_guest_name,
    merge_hour_into_message,
)

PROPERTY_ID = "3f1c2b9e-8a4d-4c6e-9f7a-1b2c3d4e5f60"


class TestBookingGuards(unittest.TestCase):
    def setUp(self) -> None:
        clear_session_bookings()

    def tearDown(self) -> None:
        clear_session_bookings()

    def _build_mock_client(self) -> MagicMock:
        mock_client = MagicMock()
        mock_client.get_public_settings.return_value = {
            "success": True,
            "data": {
                "brandName": "DRLAND",
                "hotline": "0943.257.089",
                "hotlineDigits": "0943257089",
                "zaloPhone": "0943257089",
            },
        }
        mock_client.create_booking.side_effect = lambda payload: {
            "success": True,
            "data": {
                "id": "bk-mock-1",
                "propertyId": payload["propertyId"],
                "guestName": payload["guestName"],
                "phoneNumber": payload["phoneNumber"],
                "appointmentTime": payload["appointmentTime"][:10],
                "message": payload.get("message"),
                "status": "PENDING",
            },
        }
        return mock_client

    def test_rejects_placeholder_guest_names(self) -> None:
        mock_client = self._build_mock_client()
        with patch("app.tools.client", mock_client):
            for placeholder in ("Anh/Chị", "Khách hàng", "Chưa rõ", "Guest"):
                self.assertTrue(is_placeholder_guest_name(placeholder))
                result = book_appointment_tool.invoke(
                    {
                        "property_id": PROPERTY_ID,
                        "guest_name": placeholder,
                        "phone_number": "0943257088",
                        "appointment_time": "2026-11-21T14:00:00+07:00",
                    }
                )
                self.assertIn("CHƯA LƯU VÀO HỆ THỐNG", result)

        mock_client.create_booking.assert_not_called()

    def test_allows_real_and_numbered_customer_names(self) -> None:
        for valid_name in ("Long", "Anh Long", "Nguyễn Văn Khách", "Khách Spam 0"):
            self.assertFalse(is_placeholder_guest_name(valid_name))

        mock_client = self._build_mock_client()
        with patch("app.tools.client", mock_client):
            result_str = book_appointment_tool.invoke(
                {
                    "property_id": PROPERTY_ID,
                    "guest_name": "Anh Long",
                    "phone_number": "0943257088",
                    "appointment_time": "2026-11-21T14:00:00+07:00",
                }
            )
        parsed = json.loads(result_str)
        self.assertEqual(parsed["guestName"], "Anh Long")
        mock_client.create_booking.assert_called_once()

    def test_rejects_landlord_hotline_variants(self) -> None:
        mock_client = self._build_mock_client()
        with patch("app.tools.client", mock_client):
            for hotline_variant in ("0943257089", "0943.257.089", "+84 943 257 089"):
                result = book_appointment_tool.invoke(
                    {
                        "property_id": PROPERTY_ID,
                        "guest_name": "Anh Long",
                        "phone_number": hotline_variant,
                        "appointment_time": "2026-11-21T14:00:00+07:00",
                    }
                )
                self.assertIn("Hotline/Zalo của chủ nhà DRLAND", result)

        mock_client.create_booking.assert_not_called()

    def test_preserves_appointment_hour_in_payload_message(self) -> None:
        mock_client = self._build_mock_client()
        with patch("app.tools.client", mock_client):
            result_str = book_appointment_tool.invoke(
                {
                    "property_id": PROPERTY_ID,
                    "guest_name": "Long",
                    "phone_number": "0943257088",
                    "appointment_time": "2026-11-21T14:00:00+07:00",
                }
            )

        parsed = json.loads(result_str)
        self.assertEqual(parsed["appointmentHour"], "14:00")
        sent_payload = mock_client.create_booking.call_args[0][0]
        self.assertEqual(sent_payload["message"], "Giờ hẹn: 14:00")

    def test_session_deduplicates_duplicate_calls_on_ok_reply(self) -> None:
        mock_client = self._build_mock_client()
        token = current_session_id_var.set("sess-ok-dedup")
        try:
            with patch("app.tools.client", mock_client):
                first_str = book_appointment_tool.invoke(
                    {
                        "property_id": PROPERTY_ID,
                        "guest_name": "Long",
                        "phone_number": "0943257088",
                        "appointment_time": "2026-11-21T14:00:00+07:00",
                    }
                )
                second_str = book_appointment_tool.invoke(
                    {
                        "property_id": PROPERTY_ID,
                        "guest_name": "Anh Long",
                        "phone_number": "0943257088",
                        "appointment_time": "2026-11-21T14:00:00+07:00",
                    }
                )
        finally:
            current_session_id_var.reset(token)

        first = json.loads(first_str)
        second = json.loads(second_str)
        self.assertNotIn("alreadyBooked", first)
        self.assertTrue(second["alreadyBooked"])
        mock_client.create_booking.assert_called_once()

        status_text = build_session_booking_status("sess-ok-dedup")
        self.assertIn("LỊCH HẸN ĐÃ ĐƯỢC CHỐT THÀNH CÔNG", status_text)
        self.assertIn("0943257088", status_text)
        self.assertIn("14:00", status_text)

    def test_session_allows_updating_appointment_hour(self) -> None:
        mock_client = self._build_mock_client()
        token = current_session_id_var.set("sess-change-hour")
        try:
            with patch("app.tools.client", mock_client):
                book_appointment_tool.invoke(
                    {
                        "property_id": PROPERTY_ID,
                        "guest_name": "Anh Long",
                        "phone_number": "0943257088",
                        "appointment_time": "2026-11-21T14:00:00+07:00",
                    }
                )
                updated_str = book_appointment_tool.invoke(
                    {
                        "property_id": PROPERTY_ID,
                        "guest_name": "Anh Long",
                        "phone_number": "0943257088",
                        "appointment_time": "2026-11-21T16:00:00+07:00",
                    }
                )
        finally:
            current_session_id_var.reset(token)

        updated = json.loads(updated_str)
        self.assertEqual(updated["appointmentHour"], "16:00")
        self.assertEqual(mock_client.create_booking.call_count, 2)
        status_text = build_session_booking_status("sess-change-hour")
        self.assertIn("16:00", status_text)

    def test_ground_truth_phone_rejects_hallucinated_and_accepts_formatted(self) -> None:
        mock_client = self._build_mock_client()
        token_missing = current_human_texts_var.set(["Ngày mai 2h chiều qua xem"])
        try:
            with patch("app.tools.client", mock_client):
                rejected = book_appointment_tool.invoke(
                    {
                        "property_id": PROPERTY_ID,
                        "guest_name": "Minh",
                        "phone_number": "0901234567",
                        "appointment_time": "2026-11-21T14:00:00+07:00",
                    }
                )
            self.assertIn("Khách hàng chưa cung cấp số điện thoại này", rejected)
            mock_client.create_booking.assert_not_called()
        finally:
            current_human_texts_var.reset(token_missing)

        for human_msg in ("Mình tên Long, 0943.257.088", "0943 257 088 2h chiều mai", "+84 943 257 088"):
            mock_client.reset_mock()
            token_ok = current_human_texts_var.set([human_msg])
            try:
                with patch("app.tools.client", mock_client):
                    ok_str = book_appointment_tool.invoke(
                        {
                            "property_id": PROPERTY_ID,
                            "guest_name": "Long",
                            "phone_number": "0943257088",
                            "appointment_time": "2026-11-21T14:00:00+07:00",
                        }
                    )
                parsed = json.loads(ok_str)
                self.assertEqual(parsed["phoneNumber"], "0943257088")
                mock_client.create_booking.assert_called_once()
            finally:
                current_human_texts_var.reset(token_ok)

    def test_resolves_room_code_to_uuid_automatically(self) -> None:
        mock_client = self._build_mock_client()
        mock_client.search_properties.return_value = {
            "success": True,
            "data": [
                {"id": PROPERTY_ID, "code": "P303", "name": "Phòng 303"},
            ],
        }
        with patch("app.tools.client", mock_client):
            ok_str = book_appointment_tool.invoke(
                {
                    "property_id": "P303",
                    "guest_name": "Anh Long",
                    "phone_number": "0943257088",
                    "appointment_time": "2026-11-21T14:00:00+07:00",
                }
            )
        parsed = json.loads(ok_str)
        self.assertEqual(parsed["propertyId"], PROPERTY_ID)
        sent_payload = mock_client.create_booking.call_args[0][0]
        self.assertEqual(sent_payload["propertyId"], PROPERTY_ID)

    def test_replaces_stale_hour_and_rejects_extended_placeholders(self) -> None:
        self.assertEqual(
            merge_hour_into_message("Giờ hẹn: 14:00 — Xem sớm", "16:00"),
            "Giờ hẹn: 16:00 — Xem sớm",
        )
        for bad_name in ("Khách xem phòng", "0943257088"):
            self.assertTrue(is_placeholder_guest_name(bad_name))


if __name__ == "__main__":
    unittest.main()
