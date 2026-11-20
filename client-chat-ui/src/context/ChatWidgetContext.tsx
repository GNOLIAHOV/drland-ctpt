import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PUBLIC_SETTINGS,
  fetchHouses,
  fetchPublicSettings,
  type HouseItem,
  type PublicSettings,
} from '../api/chatApi';

interface ChatWidgetContextValue {
  isOpen: boolean;
  inputText: string;
  setInputText: (value: string) => void;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  askAboutProperty: (propertyName: string) => void;
  houses: HouseItem[];
  settings: PublicSettings;
  refreshHouses: () => Promise<void>;
}

const ChatWidgetContext = createContext<ChatWidgetContextValue | undefined>(undefined);

export function ChatWidgetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [houses, setHouses] = useState<HouseItem[]>([]);
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT_PUBLIC_SETTINGS);

  const refreshHouses = useCallback(async () => {
    const [housesRes, settingsRes] = await Promise.allSettled([
      fetchHouses(),
      fetchPublicSettings(),
    ]);
    if (housesRes.status === 'fulfilled') {
      setHouses(housesRes.value);
    }
    if (settingsRes.status === 'fulfilled') {
      setSettings(settingsRes.value);
    }
  }, []);

  useEffect(() => {
    void refreshHouses();

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void refreshHouses();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [refreshHouses]);

  const openChat = () => setIsOpen(true);
  const closeChat = () => setIsOpen(false);
  const toggleChat = () => setIsOpen((prev) => !prev);

  const askAboutProperty = (propertyName: string) => {
    setIsOpen(true);
    setInputText(`Chào bạn, tư vấn cho tôi về phòng ${propertyName} nhé!`);
  };

  return (
    <ChatWidgetContext.Provider
      value={{
        isOpen,
        inputText,
        setInputText,
        openChat,
        closeChat,
        toggleChat,
        askAboutProperty,
        houses,
        settings,
        refreshHouses,
      }}
    >
      {children}
    </ChatWidgetContext.Provider>
  );
}

export function useChatWidget(): ChatWidgetContextValue {
  const context = useContext(ChatWidgetContext);
  if (!context) {
    throw new Error('useChatWidget must be used within a ChatWidgetProvider');
  }
  return context;
}
