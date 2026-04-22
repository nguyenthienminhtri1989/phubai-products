File: src/components/kdsx/ActualProductionGrid.tsx
Sửa phần render ô ngày — định mức phải lấy theo itemId thực tế của ô đó, không phải theo segment KH:
typescript// CŨ: lấy định mức từ segment KH (theo machineId + day)
const planKg = getPlanKg(machine.id, day, segments, holidays);

// MỚI: lấy định mức theo itemId thực tế của ô
const actualItemId = cell?.itemId;
const matchingSeg = actualItemId
? segments.find(s => s.machineId === machine.id && s.itemId === actualItemId && day >= s.fromDay && day <= s.toDay)
?? segments.find(s => s.itemId === actualItemId) // fallback: tìm bất kỳ segment nào cùng itemId trên máy đó
: segments.find(s => s.machineId === machine.id && day >= s.fromDay && day <= s.toDay);
const planKg = matchingSeg ? matchingSeg.kgPerDay : 0;
Giải thích: nếu ô thực tế có itemId = 5 (32CVCM, 800 kg/ngày) thì tìm segment cùng máy + cùng itemId để lấy đúng định mức 800. Không lấy nhầm segment của mặt hàng khác (26COCD, 900 kg/ngày) dù cùng máy cùng ngày.
