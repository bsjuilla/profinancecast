function filterCat(btn, cat) {
  document.querySelectorAll('.cat').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Filter both grid cards and the featured hero post so categories like "Debt
  // payoff" -- whose only article lives in the featured slot -- still show content.
  const cards = document.querySelectorAll('.art-card, .featured');
  cards.forEach(card => {
    const show = (cat === 'all' || card.dataset.cat === cat);
    const display = card.classList.contains('featured') ? 'grid' : 'flex';
    card.style.display = show ? display : 'none';
  });
}

function searchArticles() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  if (!q) { filterCat(document.querySelector('.cat.active'), 'all'); return; }
  document.querySelectorAll('.art-card').forEach(card => {
    const title = card.querySelector('.art-card-title')?.textContent.toLowerCase() || '';
    const excerpt = card.querySelector('.art-card-excerpt')?.textContent.toLowerCase() || '';
    card.style.display = (title.includes(q) || excerpt.includes(q)) ? 'flex' : 'none';
  });
}

async function subscribeNewsletter() {
  const input = document.getElementById('nl-email');
  const email = input.value.trim();
  const btn = document.querySelector('.newsletter-btn');
  if (!email || !/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email)) {
    alert('Please enter a valid email address.');
    return;
  }
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Subscribing…';
  try {
    const res = await fetch('/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'blog' }),
    });
    if (res.ok) {
      btn.textContent = 'Subscribed — thanks!';
      btn.style.background = '#22C55E';
      input.value = '';
    } else if (res.status === 429) {
      btn.textContent = 'Too many — slow down';
      btn.style.background = '#EF4444';
    } else {
      btn.textContent = 'Try again';
      btn.style.background = '#EF4444';
    }
  } catch (e) {
    btn.textContent = 'Network error — try again';
    btn.style.background = '#EF4444';
  } finally {
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
      btn.disabled = false;
    }, 3500);
  }
}
