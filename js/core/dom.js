// Small DOM helpers shared by the UI modules (read inputs / radio groups, modals, input formatting, HTML escaping).

export function selectRadio(groupId, cb) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('button').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      cb();
    });
  });
}
export function getRadioVal(groupId) {
  return document.getElementById(groupId).querySelector('button.sel').dataset.val;
}
export function num(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isFinite(v) ? v : 0;
}
export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function openModal(id) { document.getElementById(id).classList.add('open'); }
export function closeModal(id) { document.getElementById(id).classList.remove('open'); }
// Auto-format an input's displayed value to a fixed decimal count on blur (and once at load) so the input
// box stays visually consistent with the same value's fmt(...,dec) precision in the printed report tables.
export function wireDecimalAutoFormat(id, decimals) {
  const el = document.getElementById(id);
  const formatDecimal = () => {
    const v = parseFloat(el.value);
    if (isFinite(v)) el.value = v.toFixed(decimals);
  };
  el.addEventListener('blur', formatDecimal);
  formatDecimal();
}
