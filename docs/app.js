/* global hljs */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Highlight.js
  if (typeof hljs !== 'undefined') {
    hljs.highlightAll();
  }

  // 1. Mobile Menu Drawer Toggle
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== menuToggle
      ) {
        sidebar.classList.remove('open');
      }
    });
  }

  // Close sidebar on link click (mobile view)
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    });
  });

  // 2. Dual-Sync Scrollspy (Sidebar links + Right TOC links)
  const sections = document.querySelectorAll('.doc-section');
  const tocLinks = document.querySelectorAll('.toc-link');
  const scrollOffset = 110; // Offset including header padding

  function updateActiveLink() {
    let currentId = '';
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop - scrollOffset;
      const sectionHeight = section.offsetHeight;

      if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
        currentId = section.getAttribute('id');
      }
    });

    if (currentId) {
      // Sync Left Sidebar Nav Link
      navLinks.forEach((link) => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentId}`) {
          link.classList.add('active');
        }
      });

      // Sync Right TOC Nav Link
      tocLinks.forEach((link) => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentId}`) {
          link.classList.add('active');
        }
      });
    }
  }

  window.addEventListener('scroll', updateActiveLink);
  updateActiveLink(); // Initial run

  // 3. Premium Copy to Clipboard with Animated Feedback
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      let textToCopy = btn.getAttribute('data-copy');

      // If button has specific ID, target adjacent pre/code blocks
      if (btn.id === 'copy-hwid' || btn.id === 'copy-manager') {
        const codeBlock = btn.closest('.code-wrapper')?.querySelector('code');
        if (codeBlock) {
          textToCopy = codeBlock.innerText;
        }
      }

      if (textToCopy) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          const originalText = btn.innerHTML;
          btn.innerHTML = '&#10003; Copied!';
          btn.style.borderColor = 'var(--accent-green)';
          btn.style.color = 'var(--accent-green)';

          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.borderColor = '';
            btn.style.color = '';
          }, 2000);
        } catch (err) {
          btn.innerText = 'Failed';
        }
      }
    });
  });

  // 4. Live Search Filters
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    // '/' hotkey to focus search field
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    });

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();

      sections.forEach((section) => {
        const text = section.innerText.toLowerCase();
        const header = section.querySelector('h2').innerText.toLowerCase();

        // Search matches either header or body content
        if (header.includes(query) || text.includes(query)) {
          section.style.display = 'block';
          // Smooth fade in
          section.style.opacity = '1';
        } else {
          section.style.display = 'none';
        }
      });
    });
  }
});
