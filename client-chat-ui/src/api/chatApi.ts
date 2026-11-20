import axios from 'axios';

function resolveServiceUrl(
  envUrl: string | undefined,
  defaultLocalUrl: string,
  proxyPrefix: string,
): string {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
      return proxyPrefix;
    }
  }
  return envUrl || defaultLocalUrl;
}

const AI_AGENT_URL = resolveServiceUrl(
  import.meta.env.VITE_AI_AGENT_URL,
  'http://localhost:8000',
  '/ai-api',
);
const CORE_API_URL = resolveServiceUrl(
  import.meta.env.VITE_CORE_API_URL,
  'http://localhost:3001',
  '/core-api',
);

export const chatClient = axios.create({
  baseURL: AI_AGENT_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

export const coreApiClient = axios.create({
  baseURL: CORE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

export interface ChatRequestPayload {
  session_id: string;
  message: string;
}

export interface ChatResponsePayload {
  response: string;
}

export type PropertyType = 'ROOM' | 'COMMERCIAL_SPACE';
export type PropertyStatus = 'AVAILABLE' | 'SOON_TO_BE_AVAILABLE' | 'DEPOSITED' | 'RENTED';

export interface PropertyHouseSummary {
  id: string;
  code: string;
  name: string;
  address: string;
}

export interface HouseItem extends PropertyHouseSummary {
  description?: string | null;
  stats?: {
    totalProperties: number;
    roomCount: number;
    commercialCount: number;
    rentedCount: number;
    availableCount: number;
  };
}

export interface PublicSettings {
  brandName: string;
  hotline: string;
  hotlineDigits: string;
  zaloPhone: string;
  viewingHours: string;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  brandName: 'DRLAND',
  hotline: '0943.257.089',
  hotlineDigits: '0943257089',
  zaloPhone: '0943257089',
  viewingHours: '08:00 - 20:30 (Mỗi ngày)',
};

export interface PropertyItem {
  id: string;
  code: string;
  name: string;
  type: PropertyType;
  status: PropertyStatus;
  availableFrom: string | null;
  address: string;
  houseId?: string | null;
  house?: PropertyHouseSummary | null;
  area: number;
  monthlyRent: number;
  deposit: number | null;
  electricityRate: number;
  waterRate: number;
  serviceFee: number | null;
  description: string | null;
  images: string[];
}

export interface PaginatedPropertiesResponse {
  data: PropertyItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function sendChatMessage(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
  const { data } = await chatClient.post<ChatResponsePayload>('/chat', payload);
  return data;
}

export async function fetchProperties(): Promise<PropertyItem[]> {
  const { data } = await coreApiClient.get<PaginatedPropertiesResponse>('/properties', {
    params: { limit: 100 },
  });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function fetchHouses(): Promise<HouseItem[]> {
  const { data } = await coreApiClient.get<HouseItem[]>('/houses');
  return Array.isArray(data) ? data : [];
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const { data } = await coreApiClient.get<Partial<PublicSettings>>('/settings/public');
  return {
    brandName: data?.brandName?.trim() || DEFAULT_PUBLIC_SETTINGS.brandName,
    hotline: data?.hotline?.trim() || DEFAULT_PUBLIC_SETTINGS.hotline,
    hotlineDigits:
      data?.hotlineDigits?.trim() ||
      data?.hotline?.replace(/\D/g, '') ||
      DEFAULT_PUBLIC_SETTINGS.hotlineDigits,
    zaloPhone: data?.zaloPhone?.trim() || DEFAULT_PUBLIC_SETTINGS.zaloPhone,
    viewingHours: data?.viewingHours?.trim() || DEFAULT_PUBLIC_SETTINGS.viewingHours,
  };
}

export function extractShortAddress(address: string, fallbackName?: string): string {
  const raw = (address || '').trim();
  if (!raw) return (fallbackName || '').trim();

  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return (fallbackName || '').trim();
  if (parts.length === 1) {
    return parts[0].replace(/\s*[-—–]?\s*(TP\.?\s*HCM|Hồ Chí Minh)$/i, '').trim() || parts[0];
  }

  // Ghép 2 phần đầu nếu phần thứ nhất chỉ là số nhà/hẻm/lô (VD: "14B8, Ngô Tất Tố, ...")
  const houseNumberPattern = /^(số\s+|hẻm\s+|lô\s+)?[0-9]+[a-z0-9/-]*$/i;
  if (houseNumberPattern.test(parts[0]) && parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`.trim();
  }

  return parts[0];
}

function getUniqueShortAddresses(houses: HouseItem[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const h of houses) {
    const addr = extractShortAddress(h.address, h.name);
    if (addr && !seen.has(addr)) {
      seen.add(addr);
      result.push(addr);
    }
  }
  return result;
}

function extractSharedAreaSuffix(houses: HouseItem[]): string {
  if (houses.length === 0) return 'TP.HCM';

  const houseNumberPattern = /^(số\s+|hẻm\s+|lô\s+)?[0-9]+[a-z0-9/-]*$/i;
  const suffixes: string[] = [];

  for (const h of houses) {
    const parts = (h.address || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const startIdx = houseNumberPattern.test(parts[0] || '') && parts.length >= 2 ? 2 : 1;
    const area = parts.slice(startIdx).join(', ');
    if (area) {
      suffixes.push(area);
    }
  }

  if (suffixes.length === houses.length && suffixes.length > 0) {
    const normalized = new Set(suffixes.map((s) => s.toLowerCase()));
    if (normalized.size === 1) {
      return suffixes[0];
    }
  }

  return 'TP.HCM';
}

export function formatTopBarAddresses(houses: HouseItem[]): string {
  const addrs = getUniqueShortAddresses(houses);
  if (addrs.length === 0) {
    return 'Hệ thống phòng trọ & mặt bằng tại TP.HCM';
  }
  const suffix = extractSharedAreaSuffix(houses);
  if (addrs.length > 4) {
    return `${addrs.slice(0, 3).join(', ')} (+${addrs.length - 3} cơ sở khác) — ${suffix}`;
  }
  return `${addrs.join(', ')} — ${suffix}`;
}

export function formatNaturalAddressList(houses: HouseItem[]): string {
  const addrs = getUniqueShortAddresses(houses);
  const suffix = extractSharedAreaSuffix(houses);
  if (addrs.length === 0) return 'TP.HCM';
  if (addrs.length === 1) return `${addrs[0]}, ${suffix}`;
  if (addrs.length === 2) return `${addrs[0]} và ${addrs[1]}, ${suffix}`;
  return `${addrs.slice(0, -1).join(', ')} và ${addrs[addrs.length - 1]}, ${suffix}`;
}
