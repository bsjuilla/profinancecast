    // tech-debt — HAND-MAINTAINED article list (J-CONTRACT, audit 2026-05-25).
    // This array MUST be kept in sync with the public blog-*.html files surfaced
    // on /blog.html. Pre-DEF4-style "single source of truth" would derive this
    // from feed.xml (already in the project root) to prevent silent desync when
    // a new blog post is added but this list isn't updated.
    //
    // For now: any time you add a new blog-*.html article, ALSO add a matching
    // entry below (category + tag + tagClass + title + summary + date + href).
    // Future batch: replace this static array with a fetch('/feed.xml') parser
    // so the journal page becomes self-updating.
    //
    // Same articles surfaced on the public /blog page, but rendered with the
    // app's dark-theme card styling for the authed shell.
    const ARTICLES = [
      {
        category: 'debt',
        tag: 'Debt',
        tagClass: 'tag-debt',
        title: 'Debt Avalanche vs Snowball: Which Strategy Saves You the Most Money?',
        summary: 'Two proven debt payoff methods — one saves more money, one keeps you more motivated. Break down both with a real calculator to see which works for your exact debts.',
        date: 'April 12, 2026',
        href: 'blog-debt-avalanche-method.html'
      },
      {
        category: 'savings',
        tag: 'Savings',
        tagClass: 'tag-savings',
        title: 'How to Build a 3-Month Emergency Fund from Scratch',
        summary: 'The step-by-step process to save your first $3,000–$10,000 emergency fund even on a tight budget — with a week-by-week action plan.',
        date: 'April 10, 2026',
        href: 'blog-emergency-fund.html'
      },
      {
        category: 'salary',
        tag: 'Salary',
        tagClass: 'tag-salary',
        title: "How a 10% Raise Affects Your Net Worth Over 5 Years (It's More Than You Think)",
        summary: 'The compounding math behind salary increases is shocking. Exactly what $300/month extra looks like after 5 years — and how to negotiate it.',
        date: 'April 8, 2026',
        href: 'blog-salary-negotiation.html'
      },
      {
        category: 'budgeting',
        tag: 'Budgeting',
        tagClass: 'tag-budgeting',
        title: "The 50/30/20 Rule: The Only Budget You'll Ever Need",
        summary: 'The simplest budgeting framework ever created — 50% needs, 30% wants, 20% savings. How it works, whether it works for you, and how to adapt it.',
        date: 'April 5, 2026',
        href: 'blog-50-30-20.html'
      },
      {
        category: 'inflation',
        tag: 'Inflation',
        tagClass: 'tag-inflation',
        title: 'What 3.5% Inflation Actually Does to Your Savings (Visualised)',
        summary: "$10,000 today isn't $10,000 in 5 years. The real numbers, what cash in a savings account loses every year, and what to do about it.",
        date: 'April 2, 2026',
        href: 'blog-inflation.html'
      },
      {
        category: 'savings',
        tag: 'Net worth',
        tagClass: 'tag-savings',
        title: 'How to Calculate Your Real Net Worth (And What it Actually Means)',
        summary: 'Net worth is the one number that tells the true story of your finances. How to calculate it, track it monthly, and use it to guide every big decision.',
        date: 'March 28, 2026',
        href: 'blog-net-worth.html'
      },
      {
        category: 'investing',
        tag: 'Investing',
        tagClass: 'tag-investing',
        title: 'Index Funds for Beginners: The Boring Investment That Beats Most Professionals',
        summary: 'Why a simple index fund consistently outperforms 85% of actively managed funds — and how to start investing with as little as $50/month.',
        date: 'March 24, 2026',
        href: 'blog-index-funds.html'
      }
    ];

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function renderArticles(filter) {
      const grid = document.getElementById('articles-grid');
      const list = (filter === 'all' || !filter)
        ? ARTICLES
        : ARTICLES.filter(a => a.category === filter);
      grid.innerHTML = list.map(a => `
        <a class="art-card" data-cat="${escapeHtml(a.category)}" href="${escapeHtml(a.href)}">
          <span class="art-tag ${escapeHtml(a.tagClass)}">${escapeHtml(a.tag)}</span>
          <div class="art-title">${escapeHtml(a.title)}</div>
          <div class="art-summary">${escapeHtml(a.summary)}</div>
          <div class="art-footer">
            <span>${escapeHtml(a.date)}</span>
            <span class="art-read">Read &rarr;</span>
          </div>
        </a>
      `).join('');
    }

    document.getElementById('cat-filters').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-tab');
      if (!btn) return;
      document.querySelectorAll('#cat-filters .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderArticles(btn.dataset.cat);
    });

    renderArticles('all');
