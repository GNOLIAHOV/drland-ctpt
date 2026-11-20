import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import {
  buildRentalContractDocxBuffer,
  buildRentalContractHtml,
  calculateLeaseMonths,
  numberToVietnameseWords,
} from './contract-template.ts';

function readZipEntryText(bytes: Uint8Array, entryName: string): string | null {
  const buf = Buffer.from(bytes);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    return null;
  }

  const entryCount = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < entryCount; i += 1) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) {
      break;
    }
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

    if (name === entryName) {
      const lhNameLen = buf.readUInt16LE(localOffset + 26);
      const lhExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      const slice = buf.subarray(dataStart, dataStart + compSize);
      return (method === 8 ? inflateRawSync(slice) : slice).toString('utf8');
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return null;
}

test('numberToVietnameseWords đọc chuẩn số tiền tiếng Việt gồm lẻ, mốt, tư, lăm', () => {
  assert.equal(numberToVietnameseWords(0), 'Không đồng');
  assert.equal(numberToVietnameseWords(-100), 'Không đồng');
  assert.equal(numberToVietnameseWords(Number.NaN), 'Không đồng');
  assert.equal(numberToVietnameseWords(15), 'Mười lăm đồng');
  assert.equal(numberToVietnameseWords(21), 'Hai mươi mốt đồng');
  assert.equal(numberToVietnameseWords(24), 'Hai mươi tư đồng');
  assert.equal(numberToVietnameseWords(105), 'Một trăm lẻ năm đồng');
  assert.equal(numberToVietnameseWords(3800), 'Ba nghìn tám trăm đồng');
  assert.equal(
    numberToVietnameseWords(4200000),
    'Bốn triệu hai trăm nghìn đồng chẵn',
  );
  assert.equal(
    numberToVietnameseWords(1021000),
    'Một triệu không trăm hai mươi mốt nghìn đồng chẵn',
  );
  assert.equal(
    numberToVietnameseWords(1005000),
    'Một triệu không trăm lẻ năm nghìn đồng chẵn',
  );
  assert.equal(
    numberToVietnameseWords(1250000000),
    'Một tỷ hai trăm năm mươi triệu đồng chẵn',
  );
});

test('calculateLeaseMonths tính đúng số tháng thuê từ ngày bắt đầu đến hết hạn', () => {
  assert.equal(calculateLeaseMonths('2026-01-01', '2026-12-31'), 12);
  assert.equal(calculateLeaseMonths('2026-01-01', '2027-01-01'), 12);
  assert.equal(calculateLeaseMonths('2026-03-01', '2026-09-01'), 6);
  assert.equal(calculateLeaseMonths('2026-03-10', '2026-09-09'), 6);
  assert.equal(calculateLeaseMonths('2026-09-01', '2026-03-01'), null);
  assert.equal(calculateLeaseMonths(null, '2026-09-01'), null);
});

test('buildRentalContractHtml xuất đủ 7 điều khoản, căn cứ pháp lý, tiền bằng chữ và chỉ số điện nước bàn giao', () => {
  const html = buildRentalContractHtml(
    {
      code: 'P101',
      name: 'Phòng Ban Công Lầu 1',
      type: 'ROOM',
      address: '14B8 Ngô Tất Tố, Bình Thạnh, TP.HCM',
      area: 28,
      monthlyRent: 4200000,
      depositPaid: 4200000,
      electricityRate: 3800,
      waterRate: 20000,
      serviceFee: 100000,
      leaseStartDate: '2026-01-01',
      leaseEndDate: '2026-12-31',
      tenantName: 'Nguyễn Văn An',
      tenantPhone: '0909123456',
      tenantCitizenId: '079099001234',
      tenantCount: 2,
      vehicleCount: 1,
      initialElectricityIndex: 1240,
      initialWaterIndex: 85,
      rentalNotes: 'Bàn giao 2 thẻ từ và điều hòa hoạt động tốt.',
      house: { name: 'Nhà 01 - Ngô Tất Tố' },
    },
    {
      brandName: 'DRLAND',
      hotline: '0943.257.089',
      bankName: 'Ví điện tử ZaloPay',
      accountNumber: '0943257089',
      accountName: 'VO HAI LONG',
    },
  );

  assert.match(html, /HỢP ĐỒNG THUÊ PHÒNG TRỌ/);
  assert.match(html, /Bộ luật Dân sự số 91\/2015\/QH13/);
  assert.match(html, /Luật Nhà ở số 27\/2023\/QH15/);
  assert.match(html, /Ngày cấp:/);
  assert.match(html, /Địa chỉ thường trú:/);
  assert.match(html, /1\.240 kWh/);
  assert.match(html, /85 m³/);
  assert.match(html, /12 tháng/);
  assert.match(html, /Bốn triệu hai trăm nghìn đồng chẵn/);

  for (let i = 1; i <= 7; i += 1) {
    assert.ok(html.includes(`Điều ${i}.`), `Thiếu Điều ${i}`);
  }

  assert.match(html, /30 ngày/);
  assert.match(html, /07 ngày/);
  assert.match(html, /100% tiền đặt cọc/);
  assert.match(html, /Đại diện Bên A/);
  assert.match(html, /Bên B \(Bên thuê\)/);
  assert.equal(html.includes('—'), false);
});

test('buildRentalContractHtml hỗ trợ mặt bằng kinh doanh, fallback chỉ số trống và chống XSS', () => {
  const html = buildRentalContractHtml({
    code: 'MB01',
    name: 'Mặt Bằng Trệt',
    type: 'COMMERCIAL_SPACE',
    address: '14B9 Ngô Tất Tố <script>alert(1)</script>',
    area: 45,
    monthlyRent: 12000000,
    electricityRate: 3800,
    waterRate: 20000,
    serviceFee: 0,
    tenantName: 'Trần Bình <img onerror=alert(1)>',
    rentalNotes: 'Kinh doanh cà phê <script>bad()</script>',
    initialElectricityIndex: null,
    initialWaterIndex: null,
  });

  assert.match(html, /HỢP ĐỒNG THUÊ MẶT BẰNG KINH DOANH/);
  assert.match(html, /kinh doanh hợp pháp/);
  assert.match(html, /\.\.\.\.\.\.\.\. kWh/);
  assert.match(html, /\.\.\.\.\.\.\.\. m³/);
  assert.match(html, /Miễn phí/);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
});

test('buildRentalContractDocxBuffer tạo file Word .docx OpenXML thật chuẩn A4, đủ 7 điều khoản và bảng chữ ký', async () => {
  const bytes = await buildRentalContractDocxBuffer({
    code: 'P101',
    name: 'Phòng Ban Công Lầu 1',
    type: 'ROOM',
    address: '14B8 Ngô Tất Tố, Bình Thạnh, TP.HCM',
    area: 28,
    monthlyRent: 4200000,
    depositPaid: 4200000,
    electricityRate: 3800,
    waterRate: 20000,
    serviceFee: 50000,
    leaseStartDate: '2026-03-07',
    leaseEndDate: '2027-03-07',
    tenantName: 'Lê Hoàng Nam',
    tenantPhone: '0988 123 456',
    tenantCitizenId: '079200001122',
    initialElectricityIndex: 265,
    initialWaterIndex: 70,
    house: { name: 'Tòa Nhà 14B8 Ngô Tất Tố' },
  });

  assert.equal(bytes[0], 0x50); // 'P'
  assert.equal(bytes[1], 0x4b); // 'K'
  assert.ok(bytes.byteLength > 3000, 'File .docx phải có kích thước hợp lệ');

  const contentTypesXml = readZipEntryText(bytes, '[Content_Types].xml');
  assert.ok(contentTypesXml, 'Thiếu [Content_Types].xml trong gói OpenXML');
  const documentXml = readZipEntryText(bytes, 'word/document.xml');
  assert.ok(documentXml, 'Thiếu word/document.xml');

  // Kiểm tra khổ giấy A4 & lề chuẩn Nghị định 30/2020/NĐ-CP + font Times New Roman
  assert.match(documentXml, /Times New Roman/);
  assert.match(documentXml, /w:pgSz[^/]*w:w="1190\d"[^/]*w:h="1683\d"/);
  assert.match(documentXml, /w:cantSplit/);

  // Kiểm tra đủ nội dung hợp đồng tiếng Việt
  assert.match(documentXml, /HỢP ĐỒNG THUÊ PHÒNG TRỌ/);
  assert.match(documentXml, /Bộ luật Dân sự số 91\/2015\/QH13/);
  assert.match(documentXml, /265 kWh/);
  assert.match(documentXml, /70 m³/);
  assert.match(documentXml, /Bốn triệu hai trăm nghìn đồng chẵn/);
  for (let i = 1; i <= 7; i += 1) {
    assert.ok(documentXml.includes(`Điều ${i}.`), `Thiếu Điều ${i} trong word/document.xml`);
  }
  assert.match(documentXml, /ĐẠI DIỆN BÊN A/);
  assert.match(documentXml, /BÊN B \(BÊN THUÊ\)/);
});
