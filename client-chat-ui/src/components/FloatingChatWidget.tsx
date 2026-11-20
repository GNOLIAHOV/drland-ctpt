import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Send,
  User,
  RotateCcw,
  Building2,
  CalendarCheck,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Minimize2,
  PhoneCall,
  Home,
  MessageCircle,
} from 'lucide-react';
import {
  DEFAULT_PUBLIC_SETTINGS,
  formatNaturalAddressList,
  sendChatMessage,
  type HouseItem,
  type PublicSettings,
} from '../api/chatApi';
import { useChatWidget } from '../context/ChatWidgetContext';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  isError?: boolean;
}

const QUICK_PROMPTS = [
  {
    icon: Search,
    label: 'Phòng trống hôm nay',
    prompt: 'Hiện tại bên mình còn những phòng nào đang trống vào ở ngay vậy ạ?',
  },
  {
    icon: Building2,
    label: 'Phòng dưới 4 triệu',
    prompt: 'Tư vấn giúp mình các phòng trống có giá dưới 4.000.000 đ/tháng nhé.',
  },
  {
    icon: CalendarCheck,
    label: 'Hẹn qua xem phòng',
    prompt: 'Mình muốn hẹn qua xem phòng thực tế thì cần báo những thông tin gì ạ?',
  },
  {
    icon: Home,
    label: 'Điện nước & Cọc',
    prompt: 'Bên mình tính giá điện, giá nước và tiền cọc phòng như thế nào vậy ạ?',
  },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderCleanMessageText(text: string) {
  const normalized = text.replace(/^#{1,6}\s+/gm, '');
  const parts = normalized.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function buildWelcomeMessage(houses: HouseItem[], settings: PublicSettings): string {
  const locationText =
    houses.length > 0
      ? `(${formatNaturalAddressList(houses)})`
      : '(tại TP.HCM)';
  return `Dạ em chào anh/chị! Em là quản lý hệ thống phòng trọ & mặt bằng ${settings.brandName} ${locationText}. Em có thể hỗ trợ anh/chị kiểm tra phòng còn trống, báo giá phòng, tiền điện nước và hẹn giờ qua xem trực tiếp. Anh/chị đang cần tìm ở cơ sở nào và tầm giá bao nhiêu ạ?`;
}

export default function FloatingChatWidget() {
  const { isOpen, inputText, setInputText, toggleChat, closeChat, houses, settings } = useChatWidget();

  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const housesRef = useRef<HouseItem[]>(houses);
  const settingsRef = useRef<PublicSettings>(settings);

  useEffect(() => {
    housesRef.current = houses;
  }, [houses]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const startNewSession = useCallback(() => {
    const newId = uuidv4();
    setSessionId(newId);
    setMessages([
      {
        id: uuidv4(),
        sender: 'ai',
        text: buildWelcomeMessage(housesRef.current, settingsRef.current || DEFAULT_PUBLIC_SETTINGS),
        timestamp: formatTime(new Date()),
      },
    ]);
    setInputText('');
  }, [setInputText]);

  useEffect(() => {
    startNewSession();
  }, [startNewSession]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].sender === 'ai') {
        const nextText = buildWelcomeMessage(houses, settings);
        if (prev[0].text !== nextText) {
          return [{ ...prev[0], text: nextText }];
        }
      }
      return prev;
    });
  }, [houses, settings]);

  useEffect(() => {
    if (isOpen) {
      if (messages.length > 1 || isLoading) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isLoading, isOpen]);

  useEffect(() => {
    if (isOpen && inputText) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
    }
  }, [isOpen, inputText]);

  const handleSendMessage = async (customText?: string) => {
    const trimmed = (customText ?? inputText).trim();
    if (!trimmed || isLoading || !sessionId) return;

    const userMsg: ChatMessage = {
      id: uuidv4(),
      sender: 'user',
      text: trimmed,
      timestamp: formatTime(new Date()),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) {
      setInputText('');
    }
    setIsLoading(true);

    try {
      const result = await sendChatMessage({
        session_id: sessionId,
        message: trimmed,
      });

      const aiMsg: ChatMessage = {
        id: uuidv4(),
        sender: 'ai',
        text: result.response || `Dạ em xin lỗi, hệ thống bị gián đoạn đôi chút. Anh/chị có thể gọi trực tiếp Hotline ${settings.hotline} để được hỗ trợ ngay nhé ạ!`,
        timestamp: formatTime(new Date()),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error: unknown) {
      let friendlyMessage =
        `Dạ hiện tại kênh tư vấn tự động đang nhận nhiều yêu cầu. Anh/Chị có thể tham khảo trực tiếp danh sách phòng trống trên trang web hoặc liên hệ Hotline/Zalo Quản lý: ${settings.hotline} để được hỗ trợ đón tiếp xem phòng ngay nhé ạ!`;

      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ===
          'string'
      ) {
        const detail = (error as { response: { data: { detail: string } } }).response.data.detail;
        // Chỉ hiển thị detail nếu đó là thông báo thân thiện, không phải mã lỗi kỹ thuật
        if (!detail.includes('429') && !detail.includes('RESOURCE_EXHAUSTED') && !detail.includes('quota') && !detail.includes('Traceback')) {
          friendlyMessage = detail;
        }
      }

      const errorMsg: ChatMessage = {
        id: uuidv4(),
        sender: 'ai',
        text: friendlyMessage,
        timestamp: formatTime(new Date()),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSendMessage();
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
      {/* Hộp chat nổi */}
      {isOpen && (
        <div className="mb-3.5 w-[calc(100vw-2.5rem)] sm:w-[400px] h-[540px] max-h-[calc(100vh-7.5rem)] bg-white rounded-2xl shadow-lg border border-stone-200 flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none duration-150">
          {/* Header hộp chat */}
          <div className="bg-emerald-800 text-white px-5 py-4 flex items-center justify-between border-b border-emerald-900">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center text-white border border-emerald-600 shrink-0">
                <Home className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Quản Lý {settings.brandName}</h3>
                <div className="flex items-center gap-1.5 text-xs text-emerald-200 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>Trực tuyến, hỗ trợ xếp lịch xem phòng</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <a
                href={`tel:${settings.hotlineDigits}`}
                title="Gọi điện hotline"
                className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-700 active:bg-emerald-800 active:scale-90 rounded-lg transition-colors cursor-pointer"
              >
                <PhoneCall className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={startNewSession}
                disabled={isLoading}
                title="Cuộc trò chuyện mới"
                className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-700 active:bg-emerald-800 active:scale-90 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={closeChat}
                title="Thu nhỏ cửa sổ"
                className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-700 active:bg-emerald-800 active:scale-90 rounded-lg transition-colors cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Khung tin nhắn */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 bg-stone-50">
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        msg.isError
                          ? 'bg-rose-100 text-rose-600 border border-rose-200'
                          : 'bg-emerald-700 text-white'
                      }`}
                    >
                      {msg.isError ? (
                        <AlertCircle className="w-3.5 h-3.5" />
                      ) : (
                        <Home className="w-3.5 h-3.5" />
                      )}
                    </div>
                  )}

                  <div
                    className={`max-w-[84%] rounded-2xl px-4 py-2.5 text-sm ${
                      isUser
                        ? 'bg-emerald-700 text-white rounded-br-none shadow-xs'
                        : msg.isError
                          ? 'bg-rose-50 text-rose-900 border border-rose-200 rounded-bl-none'
                          : 'bg-white text-stone-800 border border-stone-200 rounded-bl-none shadow-2xs'
                    }`}
                  >
                    <div className="leading-relaxed whitespace-pre-wrap break-words">
                      {renderCleanMessageText(msg.text)}
                    </div>
                    <div
                      className={`text-[10px] mt-1 flex items-center gap-2 ${
                        isUser
                          ? 'text-emerald-200 justify-end'
                          : msg.isError
                            ? 'text-rose-500 justify-start'
                            : 'text-stone-400 justify-start'
                      }`}
                    >
                      <span>{isUser ? 'Bạn' : `Quản lý ${settings.brandName}`}</span>
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Trạng thái đang kiểm tra phòng */}
            {isLoading && (
              <div className="flex items-end gap-2 justify-start">
                <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <Home className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-none px-4 py-2.5 shadow-2xs flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-emerald-700 animate-spin shrink-0" />
                  <span className="text-xs text-stone-500 font-medium">
                    Đang kiểm tra danh sách phòng…
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Gợi ý câu hỏi nhanh */}
          {messages.length <= 2 && !isLoading && (
            <div className="px-3 py-2 bg-white border-t border-stone-200 flex flex-wrap items-center gap-1.5">
              {QUICK_PROMPTS.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => void handleSendMessage(item.prompt)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-700 hover:text-emerald-800 bg-stone-100 hover:bg-stone-200 active:bg-stone-300 active:scale-95 border border-stone-200 px-2.5 py-1 rounded-lg transition-colors shrink-0 cursor-pointer"
                  >
                    <IconComponent className="w-3 h-3 text-emerald-700" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Form nhập tin nhắn */}
          <form
            onSubmit={handleFormSubmit}
            className="p-3 bg-white border-t border-stone-200 flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
              placeholder={
                isLoading ? 'Đang phản hồi…' : 'Nhắn tin hoặc hẹn giờ xem phòng…'
              }
              className="flex-1 bg-stone-50 focus:bg-white text-stone-900 placeholder-stone-400 text-sm rounded-xl px-3.5 py-2.5 border border-stone-200 focus:border-emerald-600 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="inline-flex items-center justify-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-95 disabled:bg-stone-200 text-white font-medium text-sm px-4 py-2.5 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0 shadow-xs"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>

          {/* Hotline hỗ trợ nhanh */}
          <div className="bg-stone-100 px-4 py-2 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-600">
            <span>Cần xem phòng gấp:</span>
            <a href={`tel:${settings.hotlineDigits}`} className="font-bold text-emerald-800 hover:underline tabular-nums">
              Gọi {settings.hotline}
            </a>
          </div>
        </div>
      )}

      {/* Nút bấm nổi gọn gàng */}
      <button
        type="button"
        onClick={toggleChat}
        className="group inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 active:scale-95 text-white font-semibold px-5 py-3 rounded-full shadow-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        {isOpen ? (
          <X className="w-4 h-4 shrink-0" />
        ) : (
          <MessageCircle className="w-4 h-4 text-emerald-100 shrink-0" />
        )}
        <span className="text-sm whitespace-nowrap">{isOpen ? 'Đóng chat' : 'Tư vấn & Hẹn xem'}</span>
      </button>
    </div>
  );
}
