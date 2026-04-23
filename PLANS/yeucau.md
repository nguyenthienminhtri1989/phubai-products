<Tabs
defaultActiveKey="lines"
items={[
{
key: "lines",
label: viewMode === "KH" ? "KH — Dòng sợi" : "TH — Doanh thu thực hiện",
children: viewMode === "KH" ? (

<div>
{canEdit && (
<Button
type="primary"
icon={<PlusOutlined />}
onClick={openAddLineItem}
style={{ marginBottom: 12 }}
>
Thêm dòng sợi
</Button>
)}
<Table
dataSource={plan.lineItems}
columns={lineItemColumns}
rowKey="id"
pagination={false}
bordered
size="small"
scroll={{ x: 1300 }}
/>
</div>
) : (
<div>
<Space style={{ marginBottom: 12 }}>
<Button
type="primary"
icon={<ReloadOutlined />}
loading={syncing}
onClick={handleSync}
>
Đồng bộ SL thực tế
</Button>
{actual && (
<Button
icon={<PlusOutlined />}
onClick={() => { adHocForm.resetFields(); setAdHocModal(true); }}
>
Thêm HĐ phát sinh
</Button>
)}
{!actual && (
<Alert type="info" message="Chưa có dữ liệu TH. Nhấn Đồng bộ để tạo." showIcon style={{ padding: "2px 10px" }} />
)}
</Space>
{actual && (
<>
<Table
dataSource={actual.lineItems}
columns={actualColumns}
rowKey="id"
pagination={false}
bordered
size="small"
scroll={{ x: 1300 }}
/>
{/* Tổng kết TH nhanh */}
<div style={{ marginTop: 12, padding: "10px 16px", background: "#f6ffed", borderRadius: 6, border: "1px solid #b7eb8f" }}>
<Space size={32}>
<span>🏭 SL TH: <strong>{actual.lineItems.reduce((s, li) => s + li.qty, 0).toLocaleString("vi-VN")} kg</strong></span>
<span style={{ color: "#3f8600" }}>💰 DT TH: <strong>{fmtVnd(actual.lineItems.reduce((s, li) => s + (li.revenueVnd ?? 0), 0))}</strong></span>
<span style={{ color: actual.lineItems.reduce((s, li) => s + (li.grossProfitVnd ?? 0), 0) >= 0 ? "#3f8600" : "#cf1322" }}>
📈 LN gộp TH: <strong>{fmtVnd(actual.lineItems.reduce((s, li) => s + (li.grossProfitVnd ?? 0), 0))}</strong>
</span>
</Space>
</div>
</>
)}
</div>
),
},
{
key: "fixed",
label: viewMode === "KH" ? "KH — Chi phí cố định" : "TH — Chi phí cố định",
children: viewMode === "KH" ? (
<FixedCostTable
monthlyPlanId={plan.id}
yearMonth={plan.yearMonth}
factoryId={plan.factoryId}
readonly={!canEdit}
onSaved={fetchPlan}
/>
) : (
actual ? (
<FixedCostTable
monthlyActualId={actual.id}
yearMonth={actual.yearMonth}
factoryId={actual.factoryId}
readonly={false}
onSaved={fetchActual}
/>
) : (
<Alert type="info" message="Chưa có dữ liệu TH. Hãy đồng bộ SL thực tế trước." showIcon />
)
),
},
{
key: "summary",
label: "Tổng kết",
children: (
<Descriptions bordered column={2} size="middle">
<Descriptions.Item label="Tổng sản lượng" span={2}>
<Text strong>{plan.lineItems.reduce((s, li) => s + li.qty, 0).toLocaleString("vi-VN")} kg</Text>
</Descriptions.Item>
<Descriptions.Item label="Tổng doanh thu">
<Text strong style={{ color: "#3f8600" }}>{fmtVnd(totalRevenue)}</Text>
</Descriptions.Item>
<Descriptions.Item label="Lợi nhuận gộp">
<Text strong style={{ color: totalGrossProfit >= 0 ? "#3f8600" : "#cf1322" }}>
{fmtVnd(totalGrossProfit)}
</Text>
</Descriptions.Item>
<Descriptions.Item label="CP nguyên vật liệu">
<Text style={{ color: "#cf1322" }}>
{fmtVnd(plan.lineItems.reduce((s, li) => s + (li.cottonCostVnd ?? 0) + (li.peCostVnd ?? 0), 0))}
</Text>
</Descriptions.Item>
<Descriptions.Item label="CP bán hàng & gia công">
<Text style={{ color: "#cf1322" }}>
{fmtVnd(plan.lineItems.reduce((s, li) => s + (li.sellingCostVnd ?? 0) + (li.gcDoubleTwistVnd ?? 0), 0))}
</Text>
</Descriptions.Item>
<Descriptions.Item label="Phế thu hồi">
<Text style={{ color: "#3f8600" }}>
-{fmtVnd(plan.lineItems.reduce((s, li) => s + (li.wasteRecoveryVnd ?? 0), 0))}
</Text>
</Descriptions.Item>
<Descriptions.Item label="Tổng CP cố định (trừ HĐTC)">
<Text style={{ color: "#cf1322" }}>{fmtVnd(totalFixedCost)}</Text>
</Descriptions.Item>
{financialIncome > 0 && (
<Descriptions.Item label="Doanh thu HĐTC">
<Text style={{ color: "#3f8600" }}>+{fmtVnd(financialIncome)}</Text>
</Descriptions.Item>
)}
<Descriptions.Item label={<Text strong style={{ fontSize: 15 }}>LỢI NHUẬN RÒNG</Text>} span={2}>
{plan.fixedCosts.length === 0 ? (
<Tooltip title="Chưa nhập đủ chi phí cố định">
<Text type="secondary">--</Text>
</Tooltip>
) : (
<Text strong style={{ fontSize: 18, color: netProfit >= 0 ? "#3f8600" : "#cf1322" }}>
{fmtVnd(netProfit)}
</Text>
)}
</Descriptions.Item>
</Descriptions>
),
},
]}
/>
