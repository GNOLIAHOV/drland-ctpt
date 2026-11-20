import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';

export interface ContractSystemSettings {
  brandName?: string;
  hotline?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  landlordRepresentative?: string;
  landlordCitizenId?: string;
  landlordAddress?: string;
}

export interface ContractPropertyInput {
  id?: string;
  code: string;
  name: string;
  type?: string | null;
  address?: string | null;
  area?: number | string | null;
  monthlyRent: number | string;
  deposit?: number | string | null;
  depositPaid?: number | string | null;
  electricityRate?: number | string | null;
  waterRate?: number | string | null;
  serviceFee?: number | string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  tenantName?: string | null;
  tenantPhone?: string | null;
  tenantCitizenId?: string | null;
  tenantCitizenIdIssueDate?: string | null;
  tenantCitizenIdIssuePlace?: string | null;
  tenantPermanentAddress?: string | null;
  tenantCount?: number | null;
  vehicleCount?: number | null;
  rentalNotes?: string | null;
  initialElectricityIndex?: number | null;
  initialWaterIndex?: number | null;
  house?: {
    name?: string | null;
    address?: string | null;
  } | null;
}

const VN_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const VN_SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readVietnameseTriple(triple: number, showZeroHundred: boolean): string {
  const hundred = Math.floor(triple / 100);
  const ten = Math.floor((triple % 100) / 10);
  const unit = triple % 10;
  const parts: string[] = [];

  if (hundred > 0 || showZeroHundred) {
    parts.push(VN_DIGITS[hundred], 'trăm');
  }

  if (ten > 1) {
    parts.push(VN_DIGITS[ten], 'mươi');
    if (unit === 1) {
      parts.push('mốt');
    } else if (unit === 4) {
      parts.push('tư');
    } else if (unit === 5) {
      parts.push('lăm');
    } else if (unit > 0) {
      parts.push(VN_DIGITS[unit]);
    }
  } else if (ten === 1) {
    parts.push('mười');
    if (unit === 5) {
      parts.push('lăm');
    } else if (unit > 0) {
      parts.push(VN_DIGITS[unit]);
    }
  } else if (unit > 0) {
    if (hundred > 0 || showZeroHundred) {
      parts.push('lẻ');
    }
    parts.push(VN_DIGITS[unit]);
  }

  return parts.join(' ');
}

/**
 * Chuyển đổi số tiền (VND) sang chữ tiếng Việt chuẩn văn bản pháp lý.
 */
export function numberToVietnameseWords(amount: unknown): string {
  const numeric = Number(amount ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'Không đồng';
  }

  const rounded = Math.round(numeric);
  const groups: number[] = [];
  let remaining = rounded;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const segments: string[] = [];
  const highestIndex = groups.length - 1;
  for (let i = highestIndex; i >= 0; i -= 1) {
    const groupValue = groups[i];
    if (groupValue === 0) {
      continue;
    }
    const tripleText = readVietnameseTriple(groupValue, i < highestIndex);
    const scale = VN_SCALES[i] ?? '';
    segments.push(scale ? `${tripleText} ${scale}` : tripleText);
  }

  const rawText = segments.join(' ').replace(/\s+/g, ' ').trim();
  const suffix = rounded >= 1000 && rounded % 1000 === 0 ? 'đồng chẵn' : 'đồng';
  const capitalized = rawText.charAt(0).toUpperCase() + rawText.slice(1);
  return `${capitalized} ${suffix}`;
}

/**
 * Tính số tháng thuê ước tính giữa ngày bắt đầu và ngày kết thúc hợp đồng.
 */
export function calculateLeaseMonths(
  startDate?: string | null,
  endDate?: string | null,
): number | null {
  if (!startDate || !endDate) {
    return null;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const dayDiff = end.getDate() - start.getDate();

  if (dayDiff >= 25) {
    months += 1;
  } else if (dayDiff <= -25) {
    months -= 1;
  }

  return months >= 1 ? months : null;
}

export function escapeHtml(raw: unknown): string {
  const str = String(raw ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatContractCurrency(val: unknown): string {
  const n = Number(val ?? 0);
  if (!Number.isFinite(n)) {
    return '0 đ';
  }
  return `${new Intl.NumberFormat('vi-VN').format(n)} đ`;
}

export function formatContractDate(val?: string | null): string {
  if (!val) {
    return '..../..../20....';
  }
  const parsed = new Date(val);
  if (Number.isNaN(parsed.getTime())) {
    return '..../..../20....';
  }
  return parsed.toLocaleDateString('vi-VN');
}

function formatMeterIndex(val: number | null | undefined, unit: string): string {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return `${new Intl.NumberFormat('vi-VN').format(val)} ${unit}`;
  }
  return `........ ${unit}`;
}

interface ResolvedContractContext {
  brand: string;
  hotline: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  houseName: string;
  fullAddress: string;
  landlordAddress: string;
  landlordRepresentative: string;
  landlordCitizenId: string;
  isCommercial: boolean;
  contractTitle: string;
  unitNoun: string;
  usagePurpose: string;
  contractYear: number;
  signDay: string;
  signMonth: string;
  contractNo: string;
  code: string;
  name: string;
  areaLabel: string;
  rentValue: number;
  depositValue: number;
  elecRate: number;
  waterRate: number;
  serviceFeeValue: number;
  leasePeriodLabel: string;
  tenantName: string;
  tenantPhone: string;
  tenantCccd: string;
  tenantCccdDate: string;
  tenantCccdPlace: string;
  tenantPermanentAddress: string;
  tenantCount: number;
  vehicleCount: number;
  initialElecText: string;
  initialWaterText: string;
  rentalNotes: string;
}

function resolveContractContext(
  property: ContractPropertyInput,
  settings: ContractSystemSettings = {},
): ResolvedContractContext {
  const brand = settings.brandName?.trim() || 'DRLAND';
  const hotline = settings.hotline?.trim() || '0943.257.089';
  const bankName = settings.bankName?.trim() || 'Ví điện tử ZaloPay';
  const accountNumber = settings.accountNumber?.trim() || '0943257089';
  const accountName = settings.accountName?.trim() || 'VO HAI LONG';
  const houseName = property.house?.name?.trim() || brand;
  const fullAddress =
    property.address?.trim() || property.house?.address?.trim() || 'TP. Hồ Chí Minh';
  const landlordAddress = settings.landlordAddress?.trim() || fullAddress;

  const isCommercial = property.type === 'COMMERCIAL_SPACE';
  const contractTitle = isCommercial
    ? 'HỢP ĐỒNG THUÊ MẶT BẰNG KINH DOANH'
    : 'HỢP ĐỒNG THUÊ PHÒNG TRỌ';
  const unitNoun = isCommercial ? 'mặt bằng kinh doanh' : 'phòng trọ';
  const usagePurpose = isCommercial
    ? 'kinh doanh hợp pháp theo đúng quy định của pháp luật và nội quy tòa nhà'
    : 'để ở sinh hoạt hợp pháp, không sử dụng làm kho chứa hàng cấm hoặc hoạt động trái pháp luật';

  const now = new Date();
  const contractYear = now.getFullYear();
  const signDay = String(now.getDate()).padStart(2, '0');
  const signMonth = String(now.getMonth() + 1).padStart(2, '0');
  const contractNo = `${property.code}/${contractYear}/HĐT-${brand.toUpperCase()}`;

  const rentValue = Number(property.monthlyRent ?? 0);
  const depositValue = Number(
    property.depositPaid ?? property.deposit ?? property.monthlyRent ?? 0,
  );
  const elecRate = Number(property.electricityRate ?? 0);
  const waterRate = Number(property.waterRate ?? 0);
  const serviceFeeValue = Number(property.serviceFee ?? 0);

  const leaseMonths = calculateLeaseMonths(property.leaseStartDate, property.leaseEndDate);
  const startDateLabel = formatContractDate(property.leaseStartDate);
  const endDateLabel = formatContractDate(property.leaseEndDate);
  const leasePeriodLabel = leaseMonths
    ? `${leaseMonths} tháng (từ ngày ${startDateLabel} đến hết ngày ${endDateLabel})`
    : `từ ngày ${startDateLabel} đến hết ngày ${endDateLabel}`;

  return {
    brand,
    hotline,
    bankName,
    accountNumber,
    accountName,
    houseName,
    fullAddress,
    landlordAddress,
    landlordRepresentative: settings.landlordRepresentative?.trim() || '',
    landlordCitizenId: settings.landlordCitizenId?.trim() || '',
    isCommercial,
    contractTitle,
    unitNoun,
    usagePurpose,
    contractYear,
    signDay,
    signMonth,
    contractNo,
    code: property.code,
    name: property.name,
    areaLabel: `${property.area ?? '--'} m²`,
    rentValue,
    depositValue,
    elecRate,
    waterRate,
    serviceFeeValue,
    leasePeriodLabel,
    tenantName: property.tenantName?.trim() || '........................................',
    tenantPhone: property.tenantPhone?.trim() || '....................',
    tenantCccd: property.tenantCitizenId?.trim() || '....................',
    tenantCccdDate: property.tenantCitizenIdIssueDate?.trim() || '..../..../20....',
    tenantCccdPlace:
      property.tenantCitizenIdIssuePlace?.trim() || '........................',
    tenantPermanentAddress:
      property.tenantPermanentAddress?.trim() ||
      '........................................................',
    tenantCount: property.tenantCount ?? 1,
    vehicleCount: property.vehicleCount ?? 0,
    initialElecText: formatMeterIndex(property.initialElectricityIndex, 'kWh'),
    initialWaterText: formatMeterIndex(property.initialWaterIndex, 'm³'),
    rentalNotes: property.rentalNotes?.trim() || '',
  };
}

export function buildRentalContractHtml(
  property: ContractPropertyInput,
  settings: ContractSystemSettings = {},
): string {
  const ctx = resolveContractContext(property, settings);

  const notesHtml = ctx.rentalNotes
    ? `<li>Ghi chú bàn giao và thỏa thuận riêng: <strong>${escapeHtml(ctx.rentalNotes)}</strong></li>`
    : '';

  const landlordInfoLine = ctx.landlordRepresentative
    ? `<p>Đại diện Bên A: <strong>${escapeHtml(ctx.landlordRepresentative)}</strong>${
        ctx.landlordCitizenId
          ? ` , CCCD số: <strong>${escapeHtml(ctx.landlordCitizenId)}</strong>`
          : ''
      }</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(ctx.contractTitle)} - ${escapeHtml(ctx.code)}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 30mm;
    }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 13pt;
      line-height: 1.45;
      color: #1c1917;
      margin: 0;
      padding: 20px 26px;
      background: #ffffff;
    }
    .header {
      text-align: center;
      margin-bottom: 14px;
    }
    .nation {
      font-size: 13pt;
      font-weight: 700;
      text-transform: uppercase;
      margin: 0;
      letter-spacing: 0.3px;
    }
    .motto {
      font-size: 13pt;
      font-weight: 700;
      text-decoration: underline;
      margin: 3px 0 12px;
    }
    .title {
      font-size: 16pt;
      font-weight: 700;
      text-transform: uppercase;
      margin: 0 0 3px;
    }
    .contract-no {
      font-size: 12pt;
      font-style: italic;
      color: #44403c;
      margin: 0 0 10px;
    }
    .legal-basis {
      font-size: 12pt;
      font-style: italic;
      margin: 0 0 10px;
      padding-left: 12px;
      border-left: 2px solid #d6d3d1;
    }
    .legal-basis p {
      margin: 2px 0;
    }
    .intro-line {
      margin: 8px 0 10px;
    }
    .section-title {
      font-size: 13pt;
      font-weight: 700;
      text-transform: uppercase;
      margin: 12px 0 5px;
      color: #0c0a09;
    }
    .article-title {
      font-size: 13pt;
      font-weight: 700;
      margin: 12px 0 4px;
      color: #0c0a09;
    }
    .party-box {
      border: 1px solid #d6d3d1;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 8px;
      background: #fafaf9;
    }
    .party-box p {
      margin: 3px 0;
    }
    ul {
      margin: 4px 0 6px;
      padding-left: 20px;
    }
    li {
      margin-bottom: 3px;
    }
    table.spec-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 8px;
      font-size: 12.5pt;
    }
    table.spec-table td,
    table.spec-table th {
      border: 1px solid #a8a29e;
      padding: 5px 8px;
      text-align: left;
    }
    table.spec-table th {
      background: #f5f5f4;
      font-weight: 700;
    }
    .signatures {
      width: 100%;
      border-collapse: collapse;
      margin-top: 22px;
      page-break-inside: avoid;
    }
    .signatures td {
      width: 50%;
      text-align: center;
      vertical-align: top;
      padding: 6px 12px 72px;
    }
    .sig-role {
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .sig-note {
      font-size: 11.5pt;
      font-style: italic;
      color: #57534e;
    }
    @media print {
      body {
        padding: 0;
      }
      .party-box {
        background: transparent;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <p class="nation">Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam</p>
    <p class="motto">Độc lập - Tự do - Hạnh phúc</p>
    <h1 class="title">${escapeHtml(ctx.contractTitle)}</h1>
    <p class="contract-no">Số: ${escapeHtml(ctx.contractNo)}</p>
  </div>

  <div class="legal-basis">
    <p>Căn cứ Bộ luật Dân sự số 91/2015/QH13 được Quốc hội thông qua ngày 24/11/2015;</p>
    <p>Căn cứ Luật Nhà ở số 27/2023/QH15 và các văn bản quy phạm pháp luật hướng dẫn thi hành;</p>
    <p>Căn cứ vào nhu cầu thực tế và sự thỏa thuận tự nguyện, bình đẳng giữa các bên dưới đây.</p>
  </div>

  <p class="intro-line">
    Hôm nay, ngày <strong>${ctx.signDay}</strong> tháng <strong>${ctx.signMonth}</strong> năm <strong>${ctx.contractYear}</strong>, tại địa chỉ <strong>${escapeHtml(ctx.fullAddress)}</strong>, chúng tôi gồm có:
  </p>

  <div class="party-box">
    <p class="section-title" style="margin-top:0;">Bên Cho Thuê (Gọi tắt là Bên A): Hệ Thống ${escapeHtml(ctx.brand)}</p>
    ${landlordInfoLine}
    <p>Đơn vị quản lý trực tiếp: <strong>${escapeHtml(ctx.houseName)}</strong>, Hotline: <strong>${escapeHtml(ctx.hotline)}</strong></p>
    <p>Địa chỉ liên hệ / cơ sở cho thuê: <strong>${escapeHtml(ctx.landlordAddress)}</strong></p>
    <p>Tài khoản nhận thanh toán: <strong>${escapeHtml(ctx.accountName)}</strong>, Số tài khoản: <strong>${escapeHtml(ctx.accountNumber)}</strong> (${escapeHtml(ctx.bankName)})</p>
  </div>

  <div class="party-box">
    <p class="section-title" style="margin-top:0;">Bên Thuê (Gọi tắt là Bên B):</p>
    <p>Họ và tên khách thuê đại diện: <strong>${escapeHtml(ctx.tenantName)}</strong>, Số điện thoại: <strong>${escapeHtml(ctx.tenantPhone)}</strong></p>
    <p>Số CCCD / CMND: <strong>${escapeHtml(ctx.tenantCccd)}</strong>, Ngày cấp: <strong>${escapeHtml(ctx.tenantCccdDate)}</strong>, Nơi cấp: <strong>${escapeHtml(ctx.tenantCccdPlace)}</strong></p>
    <p>Địa chỉ thường trú: <strong>${escapeHtml(ctx.tenantPermanentAddress)}</strong></p>
    <p>Số người cư trú / sử dụng đăng ký: <strong>${ctx.tenantCount}</strong> người, Số phương tiện (xe máy): <strong>${ctx.vehicleCount}</strong> chiếc</p>
  </div>

  <p class="article-title">Điều 1. Đối tượng cho thuê và Hiện trạng bàn giao</p>
  <ul>
    <li>Bên A đồng ý cho Bên B thuê <strong>${escapeHtml(ctx.unitNoun)} mã ${escapeHtml(ctx.code)} (${escapeHtml(ctx.name)})</strong> thuộc tòa nhà <strong>${escapeHtml(ctx.houseName)}</strong>, tọa lạc tại địa chỉ: <strong>${escapeHtml(ctx.fullAddress)}</strong>.</li>
    <li>Diện tích sử dụng: <strong>${escapeHtml(ctx.areaLabel)}</strong>. Mục đích thuê: sử dụng ${escapeHtml(ctx.usagePurpose)}.</li>
    <li>Hiện trạng khi nhận bàn giao: phòng/mặt bằng sạch sẽ, hệ thống điện nước, khóa cửa, khóa vân tay và trang thiết bị gắn tường hoạt động bình thường.</li>
  </ul>
  <table class="spec-table">
    <tr>
      <th>Hạng mục bàn giao</th>
      <th>Chỉ số / Tình trạng lúc ký nhận</th>
      <th>Đơn giá áp dụng</th>
    </tr>
    <tr>
      <td>Công tơ điện riêng</td>
      <td><strong>${escapeHtml(ctx.initialElecText)}</strong></td>
      <td><strong>${escapeHtml(formatContractCurrency(ctx.elecRate))} / kWh</strong></td>
    </tr>
    <tr>
      <td>Đồng hồ nước máy</td>
      <td><strong>${escapeHtml(ctx.initialWaterText)}</strong></td>
      <td><strong>${escapeHtml(formatContractCurrency(ctx.waterRate))} / m³</strong></td>
    </tr>
    <tr>
      <td>Phí dịch vụ quản lý</td>
      <td>Vệ sinh chung, rác, an ninh tòa nhà</td>
      <td><strong>${ctx.serviceFeeValue > 0 ? `${escapeHtml(formatContractCurrency(ctx.serviceFeeValue))} / tháng` : 'Miễn phí'}</strong></td>
    </tr>
  </table>

  <p class="article-title">Điều 2. Thời hạn thuê</p>
  <ul>
    <li>Thời hạn thuê: <strong>${escapeHtml(ctx.leasePeriodLabel)}</strong>.</li>
    <li>Gia hạn hợp đồng: Trước khi hợp đồng hết hạn ít nhất <strong>30 ngày</strong>, hai bên cùng trao đổi về việc gia hạn. Nếu hai bên thống nhất tiếp tục thuê sẽ ký phụ lục gia hạn hoặc hợp đồng mới; trường hợp không gia hạn, hai bên tiến hành thủ tục thanh lý và bàn giao theo Điều 6.</li>
  </ul>

  <p class="article-title">Điều 3. Giá thuê, Tiền đặt cọc và Phương thức thanh toán</p>
  <ul>
    <li>Giá thuê cố định hàng tháng: <strong>${escapeHtml(formatContractCurrency(ctx.rentValue))} / tháng</strong> (Bằng chữ: <em>${escapeHtml(numberToVietnameseWords(ctx.rentValue))}</em>). Giá thuê này không thay đổi trong suốt thời hạn hợp đồng đang có hiệu lực.</li>
    <li>Tiền đặt cọc bảo đảm thực hiện hợp đồng: <strong>${escapeHtml(formatContractCurrency(ctx.depositValue))}</strong> (Bằng chữ: <em>${escapeHtml(numberToVietnameseWords(ctx.depositValue))}</em>). Tiền cọc không được tự ý cấn trừ vào tiền thuê tháng cuối nếu chưa có sự đồng ý của Bên A.</li>
    <li>Thời hạn thanh toán: Bên B thanh toán tiền thuê phòng và các khoản phí điện, nước, dịch vụ phát sinh từ <strong>ngày 01 đến ngày 05 hàng tháng</strong> qua chuyển khoản ngân hàng/ví điện tử theo thông tin tài khoản Bên A đã nêu hoặc tiền mặt có biên nhận.</li>
  </ul>

  <p class="article-title">Điều 4. Quyền và Nghĩa vụ của Bên A (Bên cho thuê)</p>
  <ul>
    <li>Bàn giao đúng diện tích, đúng thời gian và đảm bảo quyền sử dụng ổn định, độc lập, an toàn cho Bên B trong suốt thời gian thuê.</li>
    <li>Giữ ổn định mức giá thuê đã thỏa thuận tại Điều 3; thông báo công khai và minh bạch chỉ số điện, nước định kỳ hàng tháng.</li>
    <li>Hỗ trợ hướng dẫn và thực hiện thủ tục khai báo tạm trú/lưu trú với công an địa phương sau khi Bên B cung cấp đủ giấy tờ tùy thân hợp lệ.</li>
    <li>Bảo trì kết cấu xây dựng chính, đường dây điện âm tường, đường ống cấp thoát nước và hệ thống PCCC chung của tòa nhà; tôn trọng không gian riêng tư của Bên B và thông báo trước khi cần kiểm tra, sửa chữa (trừ trường hợp khẩn cấp).</li>
    <li>Hoàn trả đầy đủ 100% tiền đặt cọc cho Bên B khi hợp đồng chấm dứt đúng quy định và hoàn tất bàn giao.</li>
  </ul>

  <p class="article-title">Điều 5. Quyền và Nghĩa vụ của Bên B (Bên thuê)</p>
  <ul>
    <li>Thanh toán đầy đủ và đúng hạn tiền thuê cùng các chi phí điện, nước, dịch vụ từ ngày 01 đến ngày 05 hàng tháng.</li>
    <li>Cung cấp đầy đủ bản sao/thông tin CCCD và thông tin người cùng ở cho Bên A để đăng ký tạm trú theo quy định của pháp luật; không cho người ngoài cư trú qua đêm dài ngày hoặc sang nhượng, cho thuê lại khi chưa có sự đồng ý bằng văn bản của Bên A.</li>
    <li>Chấp hành nghiêm túc nội quy tòa nhà, giữ gìn vệ sinh chung, giữ trật tự sau 22:00 giờ hàng ngày; tuyệt đối không tàng trữ, sử dụng chất cấm, chất dễ cháy nổ, vũ khí hoặc tổ chức hành vi vi phạm pháp luật.</li>
    <li>Không tự ý đục phá tường, thay đổi kết cấu hoặc lắp đặt thêm thiết bị công suất lớn gây quá tải hệ thống điện; có trách nhiệm bảo quản tài sản bàn giao và bồi thường thiệt hại nếu làm hư hỏng do lỗi chủ quan của Bên B (trừ hao mòn tự nhiên).</li>
  </ul>

  <p class="article-title">Điều 6. Chấm dứt hợp đồng, Hoàn trả tiền cọc và Xử lý vi phạm</p>
  <ul>
    <li>Thông báo chấm dứt trước hạn: Bên nào muốn chấm dứt hợp đồng trước thời hạn phải thông báo trước cho bên còn lại tối thiểu <strong>30 ngày</strong> bằng văn bản hoặc tin nhắn xác nhận.</li>
    <li>Trường hợp Bên B tự ý dọn đi hoặc đơn phương hủy hợp đồng trước hạn mà không báo trước đủ 30 ngày (trừ lý do bất khả kháng được hai bên thống nhất), Bên B sẽ mất toàn bộ số tiền đặt cọc đã nộp.</li>
    <li>Trường hợp Bên A đơn phương chấm dứt hợp đồng trước hạn trái thỏa thuận, Bên A phải hoàn trả toàn bộ tiền đặt cọc và bồi thường cho Bên B một khoản tương đương số tiền đã đặt cọc.</li>
    <li>Quy trình hoàn cọc khi hết hạn hợp đồng: Khi kết thúc đúng hạn (hoặc báo trước đủ 30 ngày), hai bên kiểm tra hiện trạng tài sản bàn giao và chốt chỉ số điện nước cuối kỳ; Bên A hoàn trả <strong>100% tiền đặt cọc</strong> cho Bên B (sau khi trừ công nợ/chi phí khắc phục hư hỏng nếu có) trong vòng <strong>03 ngày làm việc</strong> kể từ ngày bàn giao phòng/mặt bằng.</li>
    <li>Xử lý chậm thanh toán: Nếu Bên B chậm thanh toán tiền thuê và chi phí định kỳ quá <strong>07 ngày</strong> kể từ hạn cuối ngày 05 hàng tháng mà không có lý do chính đáng được Bên A chấp thuận, Bên A có quyền đơn phương chấm dứt hợp đồng, thu hồi lại tài sản cho thuê và cấn trừ công nợ còn thiếu vào tiền đặt cọc.</li>
  </ul>

  <p class="article-title">Điều 7. Điều khoản chung và Hiệu lực hợp đồng</p>
  <ul>
    <li>Hai bên cam kết đọc kỹ, hiểu rõ và thực hiện nghiêm túc toàn bộ quyền và nghĩa vụ trong hợp đồng. Mọi sửa đổi, bổ sung phải được lập thành phụ lục văn bản có xác nhận của hai bên.</li>
    <li>Trường hợp phát sinh tranh chấp, hai bên ưu tiên thương lượng, hòa giải trên tinh thần hợp tác; nếu không đạt được thỏa thuận, vụ việc sẽ được chuyển đến Tòa án nhân dân có thẩm quyền tại TP. Hồ Chí Minh giải quyết theo quy định của pháp luật Việt Nam.</li>
    <li>Hợp đồng này được lập thành <strong>02 (hai) bản</strong> có giá trị pháp lý như nhau, mỗi bên giữ <strong>01 (một) bản</strong> và có hiệu lực kể từ ngày ký.</li>
    ${notesHtml}
  </ul>

  <table class="signatures">
    <tr>
      <td>
        <div class="sig-role">Đại diện Bên A (Bên cho thuê)</div>
        <div class="sig-note">(Ký và ghi rõ họ tên)</div>
      </td>
      <td>
        <div class="sig-role">Bên B (Bên thuê)</div>
        <div class="sig-note">(Ký và ghi rõ họ tên)</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Khổ giấy A4 chuẩn thể thức văn bản Việt Nam (Nghị định 30/2020/NĐ-CP)
// Rộng 210mm x Cao 297mm | Lề Trái 30mm, Phải 15mm, Trên 20mm, Dưới 20mm
const A4_WIDTH_TWIP = convertMillimetersToTwip(210);
const A4_HEIGHT_TWIP = convertMillimetersToTwip(297);
const MARGIN_TOP_TWIP = convertMillimetersToTwip(20);
const MARGIN_BOTTOM_TWIP = convertMillimetersToTwip(20);
const MARGIN_LEFT_TWIP = convertMillimetersToTwip(30);
const MARGIN_RIGHT_TWIP = convertMillimetersToTwip(15);
const CONTENT_WIDTH_TWIP = A4_WIDTH_TWIP - MARGIN_LEFT_TWIP - MARGIN_RIGHT_TWIP; // 165mm

const FONT_NAME = 'Times New Roman';
const BODY_SIZE_HP = 26; // 13pt
const TITLE_SIZE_HP = 32; // 16pt
const SMALL_SIZE_HP = 24; // 12pt
const LINE_SPACING_TWIP = 288; // 1.2x

interface RunOptions {
  size?: number;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  color?: string;
}

function docRun(text: string, opts: RunOptions = {}): TextRun {
  return new TextRun({
    text,
    font: FONT_NAME,
    size: opts.size ?? BODY_SIZE_HP,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color ?? '1C1917',
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

interface ParaOptions {
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  before?: number;
  after?: number;
  leftIndent?: number;
  hanging?: number;
  keepNext?: boolean;
}

function docPara(children: TextRun[] | string, opts: ParaOptions = {}): Paragraph {
  const runs = typeof children === 'string' ? [docRun(children)] : children;
  return new Paragraph({
    children: runs,
    alignment: opts.alignment ?? AlignmentType.JUSTIFIED,
    keepNext: opts.keepNext,
    spacing: {
      before: opts.before ?? 0,
      after: opts.after ?? 70,
      line: LINE_SPACING_TWIP,
    },
    indent:
      opts.leftIndent || opts.hanging
        ? { left: opts.leftIndent, hanging: opts.hanging }
        : undefined,
  });
}

function docArticleHeading(title: string): Paragraph {
  return docPara([docRun(title, { bold: true, color: '0C0A09' })], {
    alignment: AlignmentType.LEFT,
    before: 160,
    after: 60,
    keepNext: true,
  });
}

function docBullet(runs: TextRun[]): Paragraph {
  return docPara([docRun('-  ', { bold: true }), ...runs], {
    alignment: AlignmentType.JUSTIFIED,
    before: 0,
    after: 60,
    leftIndent: 320,
    hanging: 180,
  });
}

function createPartyBoxTable(heading: string, lines: TextRun[][]): Table {
  const boxBorder = { style: BorderStyle.SINGLE, size: 4, color: 'D6D3D1' };
  const paragraphs: Paragraph[] = [
    docPara([docRun(heading, { bold: true, color: '0C0A09' })], {
      alignment: AlignmentType.LEFT,
      before: 0,
      after: 60,
    }),
    ...lines.map((lineRuns, idx) =>
      docPara(lineRuns, {
        alignment: AlignmentType.LEFT,
        before: 0,
        after: idx === lines.length - 1 ? 0 : 40,
      }),
    ),
  ];

  return new Table({
    width: { size: CONTENT_WIDTH_TWIP, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH_TWIP],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH_TWIP, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FAFAF9' },
            margins: { top: 110, bottom: 110, left: 160, right: 160 },
            borders: {
              top: boxBorder,
              bottom: boxBorder,
              left: boxBorder,
              right: boxBorder,
            },
            children: paragraphs,
          }),
        ],
      }),
    ],
  });
}

function createHandoverSpecTable(ctx: ResolvedContractContext): Table {
  const col1 = Math.round(CONTENT_WIDTH_TWIP * 0.30);
  const col2 = Math.round(CONTENT_WIDTH_TWIP * 0.38);
  const col3 = CONTENT_WIDTH_TWIP - col1 - col2;
  const cellBorder = { style: BorderStyle.SINGLE, size: 6, color: 'A8A29E' };
  const borders = {
    top: cellBorder,
    bottom: cellBorder,
    left: cellBorder,
    right: cellBorder,
  };
  const cellMargins = { top: 75, bottom: 75, left: 110, right: 110 };

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      { text: 'Hạng mục bàn giao', width: col1 },
      { text: 'Chỉ số / Tình trạng lúc ký nhận', width: col2 },
      { text: 'Đơn giá áp dụng', width: col3 },
    ].map(
      (col) =>
        new TableCell({
          width: { size: col.width, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F4' },
          margins: cellMargins,
          borders,
          children: [
            docPara([docRun(col.text, { bold: true, size: SMALL_SIZE_HP })], {
              alignment: AlignmentType.LEFT,
              after: 0,
            }),
          ],
        }),
    ),
  });

  const bodyRowsData = [
    [
      { text: 'Công tơ điện riêng', bold: false },
      { text: ctx.initialElecText, bold: true },
      { text: `${formatContractCurrency(ctx.elecRate)} / kWh`, bold: true },
    ],
    [
      { text: 'Đồng hồ nước máy', bold: false },
      { text: ctx.initialWaterText, bold: true },
      { text: `${formatContractCurrency(ctx.waterRate)} / m³`, bold: true },
    ],
    [
      { text: 'Phí dịch vụ quản lý', bold: false },
      { text: 'Vệ sinh chung, rác, an ninh tòa nhà', bold: false },
      {
        text:
          ctx.serviceFeeValue > 0
            ? `${formatContractCurrency(ctx.serviceFeeValue)} / tháng`
            : 'Miễn phí',
        bold: true,
      },
    ],
  ];

  const colWidths = [col1, col2, col3];
  const bodyRows = bodyRowsData.map(
    (cells) =>
      new TableRow({
        cantSplit: true,
        children: cells.map(
          (cell, i) =>
            new TableCell({
              width: { size: colWidths[i], type: WidthType.DXA },
              margins: cellMargins,
              borders,
              children: [
                docPara([docRun(cell.text, { bold: cell.bold, size: SMALL_SIZE_HP })], {
                  alignment: AlignmentType.LEFT,
                  after: 0,
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: CONTENT_WIDTH_TWIP, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...bodyRows],
  });
}

function createSignatureTable(): Table {
  const halfWidth = Math.floor(CONTENT_WIDTH_TWIP / 2);
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const invisibleBorders = {
    top: noBorder,
    bottom: noBorder,
    left: noBorder,
    right: noBorder,
  };

  const makeSigCell = (role: string, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders: invisibleBorders,
      margins: { top: 120, bottom: 80, left: 100, right: 100 },
      children: [
        docPara([docRun(role, { bold: true })], {
          alignment: AlignmentType.CENTER,
          after: 40,
          keepNext: true,
        }),
        docPara([docRun('(Ký và ghi rõ họ tên)', { italics: true, size: SMALL_SIZE_HP, color: '57534E' })], {
          alignment: AlignmentType.CENTER,
          after: 1100,
        }),
      ],
    });

  return new Table({
    width: { size: CONTENT_WIDTH_TWIP, type: WidthType.DXA },
    columnWidths: [halfWidth, CONTENT_WIDTH_TWIP - halfWidth],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          makeSigCell('ĐẠI DIỆN BÊN A (BÊN CHO THUÊ)', halfWidth),
          makeSigCell('BÊN B (BÊN THUÊ)', CONTENT_WIDTH_TWIP - halfWidth),
        ],
      }),
    ],
  });
}

/**
 * Tạo đối tượng Document OpenXML (.docx) chuẩn A4 theo thể thức văn bản Việt Nam.
 */
export function buildRentalContractDocx(
  property: ContractPropertyInput,
  settings: ContractSystemSettings = {},
): Document {
  const ctx = resolveContractContext(property, settings);

  const partyALines: TextRun[][] = [];
  if (ctx.landlordRepresentative) {
    const repRuns: TextRun[] = [
      docRun('Đại diện Bên A: '),
      docRun(ctx.landlordRepresentative, { bold: true }),
    ];
    if (ctx.landlordCitizenId) {
      repRuns.push(docRun(', CCCD số: '), docRun(ctx.landlordCitizenId, { bold: true }));
    }
    partyALines.push(repRuns);
  }
  partyALines.push(
    [
      docRun('Đơn vị quản lý trực tiếp: '),
      docRun(ctx.houseName, { bold: true }),
      docRun(', Hotline: '),
      docRun(ctx.hotline, { bold: true }),
    ],
    [
      docRun('Địa chỉ liên hệ / cơ sở cho thuê: '),
      docRun(ctx.landlordAddress, { bold: true }),
    ],
    [
      docRun('Tài khoản nhận thanh toán: '),
      docRun(ctx.accountName, { bold: true }),
      docRun(', Số tài khoản: '),
      docRun(ctx.accountNumber, { bold: true }),
      docRun(` (${ctx.bankName})`),
    ],
  );

  const partyBLines: TextRun[][] = [
    [
      docRun('Họ và tên khách thuê đại diện: '),
      docRun(ctx.tenantName, { bold: true }),
      docRun(', Số điện thoại: '),
      docRun(ctx.tenantPhone, { bold: true }),
    ],
    [
      docRun('Số CCCD / CMND: '),
      docRun(ctx.tenantCccd, { bold: true }),
      docRun(', Ngày cấp: '),
      docRun(ctx.tenantCccdDate, { bold: true }),
      docRun(', Nơi cấp: '),
      docRun(ctx.tenantCccdPlace, { bold: true }),
    ],
    [
      docRun('Địa chỉ thường trú: '),
      docRun(ctx.tenantPermanentAddress, { bold: true }),
    ],
    [
      docRun('Số người cư trú / sử dụng đăng ký: '),
      docRun(String(ctx.tenantCount), { bold: true }),
      docRun(' người, Số phương tiện (xe máy): '),
      docRun(String(ctx.vehicleCount), { bold: true }),
      docRun(' chiếc'),
    ],
  ];

  const spacerPara = () =>
    docPara([], { before: 0, after: 80, alignment: AlignmentType.LEFT });

  const article7Bullets: Paragraph[] = [
    docBullet([
      docRun(
        'Hai bên cam kết đọc kỹ, hiểu rõ và thực hiện nghiêm túc toàn bộ quyền và nghĩa vụ trong hợp đồng. Mọi sửa đổi, bổ sung phải được lập thành phụ lục văn bản có xác nhận của hai bên.',
      ),
    ]),
    docBullet([
      docRun(
        'Trường hợp phát sinh tranh chấp, hai bên ưu tiên thương lượng, hòa giải trên tinh thần hợp tác; nếu không đạt được thỏa thuận, vụ việc sẽ được chuyển đến Tòa án nhân dân có thẩm quyền tại TP. Hồ Chí Minh giải quyết theo quy định của pháp luật Việt Nam.',
      ),
    ]),
    docBullet([
      docRun('Hợp đồng này được lập thành '),
      docRun('02 (hai) bản', { bold: true }),
      docRun(' có giá trị pháp lý như nhau, mỗi bên giữ '),
      docRun('01 (một) bản', { bold: true }),
      docRun(' và có hiệu lực kể từ ngày ký.'),
    ]),
  ];

  if (ctx.rentalNotes) {
    article7Bullets.push(
      docBullet([
        docRun('Ghi chú bàn giao và thỏa thuận riêng: '),
        docRun(ctx.rentalNotes, { bold: true }),
      ]),
    );
  }

  return new Document({
    creator: `Hệ thống ${ctx.brand}`,
    title: `${ctx.contractTitle} - ${ctx.code}`,
    description: `Hợp đồng thuê ${ctx.code} tạo tự động từ hồ sơ phòng DRLAND`,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIP,
              height: A4_HEIGHT_TWIP,
            },
            margin: {
              top: MARGIN_TOP_TWIP,
              bottom: MARGIN_BOTTOM_TWIP,
              left: MARGIN_LEFT_TWIP,
              right: MARGIN_RIGHT_TWIP,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  docRun(`${ctx.contractNo} | Trang `, { size: 20, color: '78716C' }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_NAME,
                    size: 20,
                    color: '78716C',
                  }),
                  docRun(' / ', { size: 20, color: '78716C' }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: FONT_NAME,
                    size: 20,
                    color: '78716C',
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          // Quốc hiệu - Tiêu ngữ - Tiêu đề hợp đồng
          docPara([docRun('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true })], {
            alignment: AlignmentType.CENTER,
            after: 30,
          }),
          docPara([docRun('Độc lập - Tự do - Hạnh phúc', { bold: true, underline: true })], {
            alignment: AlignmentType.CENTER,
            after: 180,
          }),
          docPara([docRun(ctx.contractTitle, { bold: true, size: TITLE_SIZE_HP })], {
            alignment: AlignmentType.CENTER,
            after: 40,
          }),
          docPara([docRun(`Số: ${ctx.contractNo}`, { italics: true, size: SMALL_SIZE_HP, color: '44403C' })], {
            alignment: AlignmentType.CENTER,
            after: 140,
          }),

          // Căn cứ pháp lý
          docPara(
            [docRun('Căn cứ Bộ luật Dân sự số 91/2015/QH13 được Quốc hội thông qua ngày 24/11/2015;', { italics: true, size: SMALL_SIZE_HP })],
            { alignment: AlignmentType.LEFT, after: 30, leftIndent: 200 },
          ),
          docPara(
            [docRun('Căn cứ Luật Nhà ở số 27/2023/QH15 và các văn bản quy phạm pháp luật hướng dẫn thi hành;', { italics: true, size: SMALL_SIZE_HP })],
            { alignment: AlignmentType.LEFT, after: 30, leftIndent: 200 },
          ),
          docPara(
            [docRun('Căn cứ vào nhu cầu thực tế và sự thỏa thuận tự nguyện, bình đẳng giữa các bên dưới đây.', { italics: true, size: SMALL_SIZE_HP })],
            { alignment: AlignmentType.LEFT, after: 120, leftIndent: 200 },
          ),

          docPara(
            [
              docRun('Hôm nay, ngày '),
              docRun(ctx.signDay, { bold: true }),
              docRun(' tháng '),
              docRun(ctx.signMonth, { bold: true }),
              docRun(' năm '),
              docRun(String(ctx.contractYear), { bold: true }),
              docRun(', tại địa chỉ '),
              docRun(ctx.fullAddress, { bold: true }),
              docRun(', chúng tôi gồm có:'),
            ],
            { after: 110 },
          ),

          // Bên A & Bên B
          createPartyBoxTable(`BÊN CHO THUÊ (GỌI TẮT LÀ BÊN A): HỆ THỐNG ${ctx.brand.toUpperCase()}`, partyALines),
          spacerPara(),
          createPartyBoxTable('BÊN THUÊ (GỌI TẮT LÀ BÊN B):', partyBLines),

          // Điều 1
          docArticleHeading('Điều 1. Đối tượng cho thuê và Hiện trạng bàn giao'),
          docBullet([
            docRun('Bên A đồng ý cho Bên B thuê '),
            docRun(`${ctx.unitNoun} mã ${ctx.code} (${ctx.name})`, { bold: true }),
            docRun(' thuộc tòa nhà '),
            docRun(ctx.houseName, { bold: true }),
            docRun(', tọa lạc tại địa chỉ: '),
            docRun(ctx.fullAddress, { bold: true }),
            docRun('.'),
          ]),
          docBullet([
            docRun('Diện tích sử dụng: '),
            docRun(ctx.areaLabel, { bold: true }),
            docRun(`. Mục đích thuê: sử dụng ${ctx.usagePurpose}.`),
          ]),
          docBullet([
            docRun(
              'Hiện trạng khi nhận bàn giao: phòng/mặt bằng sạch sẽ, hệ thống điện nước, khóa cửa, khóa vân tay và trang thiết bị gắn tường hoạt động bình thường.',
            ),
          ]),
          createHandoverSpecTable(ctx),

          // Điều 2
          docArticleHeading('Điều 2. Thời hạn thuê'),
          docBullet([
            docRun('Thời hạn thuê: '),
            docRun(ctx.leasePeriodLabel, { bold: true }),
            docRun('.'),
          ]),
          docBullet([
            docRun('Gia hạn hợp đồng: Trước khi hợp đồng hết hạn ít nhất '),
            docRun('30 ngày', { bold: true }),
            docRun(
              ', hai bên cùng trao đổi về việc gia hạn. Nếu hai bên thống nhất tiếp tục thuê sẽ ký phụ lục gia hạn hoặc hợp đồng mới; trường hợp không gia hạn, hai bên tiến hành thủ tục thanh lý và bàn giao theo Điều 6.',
            ),
          ]),

          // Điều 3
          docArticleHeading('Điều 3. Giá thuê, Tiền đặt cọc và Phương thức thanh toán'),
          docBullet([
            docRun('Giá thuê cố định hàng tháng: '),
            docRun(`${formatContractCurrency(ctx.rentValue)} / tháng`, { bold: true }),
            docRun(' (Bằng chữ: '),
            docRun(numberToVietnameseWords(ctx.rentValue), { italics: true }),
            docRun('). Giá thuê này không thay đổi trong suốt thời hạn hợp đồng đang có hiệu lực.'),
          ]),
          docBullet([
            docRun('Tiền đặt cọc bảo đảm thực hiện hợp đồng: '),
            docRun(formatContractCurrency(ctx.depositValue), { bold: true }),
            docRun(' (Bằng chữ: '),
            docRun(numberToVietnameseWords(ctx.depositValue), { italics: true }),
            docRun(
              '). Tiền cọc không được tự ý cấn trừ vào tiền thuê tháng cuối nếu chưa có sự đồng ý của Bên A.',
            ),
          ]),
          docBullet([
            docRun(
              'Thời hạn thanh toán: Bên B thanh toán tiền thuê phòng và các khoản phí điện, nước, dịch vụ phát sinh từ ',
            ),
            docRun('ngày 01 đến ngày 05 hàng tháng', { bold: true }),
            docRun(
              ' qua chuyển khoản ngân hàng/ví điện tử theo thông tin tài khoản Bên A đã nêu hoặc tiền mặt có biên nhận.',
            ),
          ]),

          // Điều 4
          docArticleHeading('Điều 4. Quyền và Nghĩa vụ của Bên A (Bên cho thuê)'),
          docBullet([
            docRun(
              'Bàn giao đúng diện tích, đúng thời gian và đảm bảo quyền sử dụng ổn định, độc lập, an toàn cho Bên B trong suốt thời gian thuê.',
            ),
          ]),
          docBullet([
            docRun(
              'Giữ ổn định mức giá thuê đã thỏa thuận tại Điều 3; thông báo công khai và minh bạch chỉ số điện, nước định kỳ hàng tháng.',
            ),
          ]),
          docBullet([
            docRun(
              'Hỗ trợ hướng dẫn và thực hiện thủ tục khai báo tạm trú/lưu trú với công an địa phương sau khi Bên B cung cấp đủ giấy tờ tùy thân hợp lệ.',
            ),
          ]),
          docBullet([
            docRun(
              'Bảo trì kết cấu xây dựng chính, đường dây điện âm tường, đường ống cấp thoát nước và hệ thống PCCC chung của tòa nhà; tôn trọng không gian riêng tư của Bên B và thông báo trước khi cần kiểm tra, sửa chữa (trừ trường hợp khẩn cấp).',
            ),
          ]),
          docBullet([
            docRun(
              'Hoàn trả đầy đủ 100% tiền đặt cọc cho Bên B khi hợp đồng chấm dứt đúng quy định và hoàn tất bàn giao.',
            ),
          ]),

          // Điều 5
          docArticleHeading('Điều 5. Quyền và Nghĩa vụ của Bên B (Bên thuê)'),
          docBullet([
            docRun(
              'Thanh toán đầy đủ và đúng hạn tiền thuê cùng các chi phí điện, nước, dịch vụ từ ngày 01 đến ngày 05 hàng tháng.',
            ),
          ]),
          docBullet([
            docRun(
              'Cung cấp đầy đủ bản sao/thông tin CCCD và thông tin người cùng ở cho Bên A để đăng ký tạm trú theo quy định của pháp luật; không cho người ngoài cư trú qua đêm dài ngày hoặc sang nhượng, cho thuê lại khi chưa có sự đồng ý bằng văn bản của Bên A.',
            ),
          ]),
          docBullet([
            docRun(
              'Chấp hành nghiêm túc nội quy tòa nhà, giữ gìn vệ sinh chung, giữ trật tự sau 22:00 giờ hàng ngày; tuyệt đối không tàng trữ, sử dụng chất cấm, chất dễ cháy nổ, vũ khí hoặc tổ chức hành vi vi phạm pháp luật.',
            ),
          ]),
          docBullet([
            docRun(
              'Không tự ý đục phá tường, thay đổi kết cấu hoặc lắp đặt thêm thiết bị công suất lớn gây quá tải hệ thống điện; có trách nhiệm bảo quản tài sản bàn giao và bồi thường thiệt hại nếu làm hư hỏng do lỗi chủ quan của Bên B (trừ hao mòn tự nhiên).',
            ),
          ]),

          // Điều 6
          docArticleHeading('Điều 6. Chấm dứt hợp đồng, Hoàn trả tiền cọc và Xử lý vi phạm'),
          docBullet([
            docRun(
              'Thông báo chấm dứt trước hạn: Bên nào muốn chấm dứt hợp đồng trước thời hạn phải thông báo trước cho bên còn lại tối thiểu ',
            ),
            docRun('30 ngày', { bold: true }),
            docRun(' bằng văn bản hoặc tin nhắn xác nhận.'),
          ]),
          docBullet([
            docRun(
              'Trường hợp Bên B tự ý dọn đi hoặc đơn phương hủy hợp đồng trước hạn mà không báo trước đủ 30 ngày (trừ lý do bất khả kháng được hai bên thống nhất), Bên B sẽ mất toàn bộ số tiền đặt cọc đã nộp.',
            ),
          ]),
          docBullet([
            docRun(
              'Trường hợp Bên A đơn phương chấm dứt hợp đồng trước hạn trái thỏa thuận, Bên A phải hoàn trả toàn bộ tiền đặt cọc và bồi thường cho Bên B một khoản tương đương số tiền đã đặt cọc.',
            ),
          ]),
          docBullet([
            docRun(
              'Quy trình hoàn cọc khi hết hạn hợp đồng: Khi kết thúc đúng hạn (hoặc báo trước đủ 30 ngày), hai bên kiểm tra hiện trạng tài sản bàn giao và chốt chỉ số điện nước cuối kỳ; Bên A hoàn trả ',
            ),
            docRun('100% tiền đặt cọc', { bold: true }),
            docRun(' cho Bên B (sau khi trừ công nợ/chi phí khắc phục hư hỏng nếu có) trong vòng '),
            docRun('03 ngày làm việc', { bold: true }),
            docRun(' kể từ ngày bàn giao phòng/mặt bằng.'),
          ]),
          docBullet([
            docRun(
              'Xử lý chậm thanh toán: Nếu Bên B chậm thanh toán tiền thuê và chi phí định kỳ quá ',
            ),
            docRun('07 ngày', { bold: true }),
            docRun(
              ' kể từ hạn cuối ngày 05 hàng tháng mà không có lý do chính đáng được Bên A chấp thuận, Bên A có quyền đơn phương chấm dứt hợp đồng, thu hồi lại tài sản cho thuê và cấn trừ công nợ còn thiếu vào tiền đặt cọc.',
            ),
          ]),

          // Điều 7
          docArticleHeading('Điều 7. Điều khoản chung và Hiệu lực hợp đồng'),
          ...article7Bullets,
          spacerPara(),
          createSignatureTable(),
        ],
      },
    ],
  });
}

/**
 * Tạo Buffer file .docx OpenXML thật (dùng cho test / export phía server hoặc Node script).
 */
export async function buildRentalContractDocxBuffer(
  property: ContractPropertyInput,
  settings: ContractSystemSettings = {},
): Promise<Uint8Array> {
  const doc = buildRentalContractDocx(property, settings);
  const arrayBuffer = await Packer.toArrayBuffer(doc);
  return new Uint8Array(arrayBuffer);
}

export function printRentalContract(
  property: ContractPropertyInput,
  settings: ContractSystemSettings = {},
): void {
  const html = buildRentalContractHtml(property, settings);
  const printWindow = window.open('', '_blank', 'width=900,height=720');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
    return;
  }

  // Fallback nếu trình duyệt chặn popup: in thông qua iframe ẩn
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        iframe.remove();
      }, 1500);
    }, 250);
  }
}

export async function downloadRentalContractDoc(
  property: ContractPropertyInput,
  settings: ContractSystemSettings = {},
): Promise<void> {
  const doc = buildRentalContractDocx(property, settings);
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeCode = (property.code || 'Phong').replace(/[^a-zA-Z0-9_-]/g, '_');
  link.href = url;
  link.download = `Hop_Dong_Thue_${safeCode}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
