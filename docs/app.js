document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Toggle
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
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

  // 2. Scrollspy - Highlight Active Link on Scroll
  const sections = document.querySelectorAll('.doc-section');
  const scrollOffset = 100; // Offset for navbar

  window.addEventListener('scroll', () => {
    let currentId = '';

    sections.forEach((section) => {
      const sectionTop = section.offsetTop - scrollOffset;
      const sectionHeight = section.offsetHeight;

      if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
        currentId = section.getAttribute('id');
      }
    });

    if (currentId) {
      navLinks.forEach((link) => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentId}`) {
          link.classList.add('active');
        }
      });
    }
  });

  // 3. Copy to Clipboard
  const copyButtons = document.querySelectorAll('.copy-btn');
  copyButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const textToCopy = btn.getAttribute('data-copy');
      if (textToCopy) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          btn.innerText = 'Copied!';
          setTimeout(() => {
            btn.innerText = 'Copy';
          }, 2000);
        } catch (err) {
          btn.innerText = 'Failed';
        }
      }
    });
  });

  // Specialized copy buttons for large code snippets
  const copyHwid = document.getElementById('copy-hwid');
  if (copyHwid) {
    copyHwid.addEventListener('click', async () => {
      const codeElement = copyHwid.parentElement.nextElementSibling.querySelector('code');
      if (codeElement) {
        try {
          await navigator.clipboard.writeText(codeElement.innerText);
          copyHwid.innerText = 'Copied!';
          setTimeout(() => {
            copyHwid.innerText = 'Copy';
          }, 2000);
        } catch {
          copyHwid.innerText = 'Failed';
        }
      }
    });
  }

  const copyManager = document.getElementById('copy-manager');
  if (copyManager) {
    copyManager.addEventListener('click', async () => {
      const codeElement = copyManager.parentElement.nextElementSibling.querySelector('code');
      if (codeElement) {
        try {
          await navigator.clipboard.writeText(codeElement.innerText);
          copyManager.innerText = 'Copied!';
          setTimeout(() => {
            copyManager.innerText = 'Copy';
          }, 2000);
        } catch {
          copyManager.innerText = 'Failed';
        }
      }
    });
  }

  // 4. Live Search Filter
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    // Keyboard shortcut '/' to focus search
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
        const header = section.querySelector('h1').innerText.toLowerCase();

        if (header.includes(query) || text.includes(query)) {
          section.style.display = 'block';
        } else {
          section.style.display = 'none';
        }
      });
    });
  }
});
