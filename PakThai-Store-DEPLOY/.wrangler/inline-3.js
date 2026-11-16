
const CRISP_DIRECT_CHAT = "https://go.crisp.chat/chat/embed/?website_id=5787d483-b0e3-4627-b50d-5e6c9ae5b86b&locale=en";
function openChat() {
  const modal = document.getElementById('crispModal');
  const frame = document.getElementById('crispFrame');
  if (!modal || !frame) return;
  if (!frame.getAttribute('src')) frame.src = CRISP_DIRECT_CHAT;
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}
function closeChat() {
  const modal = document.getElementById('crispModal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}
document.getElementById('crispModal')?.addEventListener('click', event => {
  if (event.target.id === 'crispModal') closeChat();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeChat();
});
