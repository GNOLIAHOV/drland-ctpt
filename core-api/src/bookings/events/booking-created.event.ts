export const BOOKING_CREATED_EVENT = 'booking.created';

export interface BookingCreatedEvent {
  bookingId: string;
  propertyId: string;
  propertyCode: string;
  propertyName: string;
  guestName: string;
  phoneNumber: string;
  guestEmail: string | null;
  appointmentTime: string | null;
  message: string | null;
}
