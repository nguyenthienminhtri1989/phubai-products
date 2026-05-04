File: src/app/kdsx/production-schedule/[id]/ProductionScheduleDetailClient.tsx
Tìm đoạn:
typescriptconst factoryMachines = machines.filter(m => {
return !uniqueMachines.find(um => um.id === m.id);
});
const allMachines = [...uniqueMachines.map(m => ({ id: m.id, name: m.name, model: m.model ?? null, processId: m.processId })),
...factoryMachines.slice(0, Math.max(0, 21 - uniqueMachines.length))];
Thay bằng:
typescriptconst allMachines = uniqueMachines.map(m => ({ id: m.id, name: m.name, model: m.model ?? null, processId: m.processId }));
Bỏ hoàn toàn factoryMachines và logic đệm 21 dòng. Chỉ hiện máy đã có segment trong KH.
