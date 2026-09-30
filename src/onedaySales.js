// 원데이 매출 구분은 명시적으로 선택한 기록에만 적용한다. 과거 기록은 추정하지 않는다.
export const ONEDAY_PRICE = 30000;
export const newOnedayForm = () => ({ onedaySource: 'general', onedayMode: 'standalone', onedayPayment: '네이버', saleAction: 'new', onedaySaleId: '', onedayMembershipSaleId: '' });
export const isIncludedSale = sale => ['included', 'cancelled'].includes(sale.onedayStatus);
export const onedayLabel = booking => booking.onedaySource === 'obut' ? '오붓' : booking.onedaySource === 'general' ? (booking.onedayMode === 'membership' ? '일반 · 월회비 포함' : '일반') : '원데이 · 미분류';
export function onedayFields(form) {
  if (form.onedaySource === 'obut') return { onedaySource: 'obut', onedayMode: null, onedayPayment: '', onedaySaleId: null, onedayMembershipSaleId: null };
  return { onedaySource: 'general', onedayMode: form.onedayMode, onedayPayment: form.onedayPayment || '네이버', onedaySaleId: form.onedaySaleId ? Number(form.onedaySaleId) : null, onedayMembershipSaleId: form.onedayMode === 'membership' && form.onedayMembershipSaleId ? Number(form.onedayMembershipSaleId) : null };
}
export function saleCandidates(sales, { bookingId, name = '', date = '', membership = false } = {}) {
  return sales.filter(s => !isIncludedSale(s) && (!s.onedayBookingId || s.onedayBookingId === bookingId)
    && (membership ? ['new_member', 'renewal'].includes(s.type) && s.amount >= ONEDAY_PRICE : s.type === 'oneday' && s.amount === ONEDAY_PRICE))
    .sort((a, b) => Number(b.memberName === name) - Number(a.memberName === name) || Number(b.date === date) - Number(a.date === date) || b.date.localeCompare(a.date) || b.id - a.id);
}
export function validateOnedayForm(form) {
  if (!['general', 'obut'].includes(form.onedaySource)) return '일반 또는 오붓을 선택해주세요.';
  if (form.onedaySource === 'obut') return '';
  if (!['standalone', 'membership'].includes(form.onedayMode)) return '원데이만 또는 월회원 등록을 선택해주세요.';
  if (form.saleAction === 'existing' && !form.onedaySaleId) return '연결할 기존 원데이 매출을 선택해주세요.';
  return '';
}
