(function () {
  function getPostUrl(videoEl) {
    const container =
      videoEl.closest(
        '[data-e2e="feed-item"], [data-e2e="recommend-list-item-container"], article, div[class*="DivItemContainer"], div[class*="DivContentContainer"]'
      ) || videoEl.parentElement;

    let candidateLinks = [];
    if (container) {
      candidateLinks = Array.from(container.querySelectorAll('a[href*="/video/"]'));
    }

    const currentUrl = window.location.href;
    const allUrls = candidateLinks.map((a) => a.href).concat([currentUrl]);

    for (const url of allUrls) {
      const match = url.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[^/?#]+\/video\/\d+/);
      if (match) {
        return match[0];
      }
    }

    // Fallback: match raw video ID and construct URL
    if (container) {
      const idMatch = container.innerHTML.match(/\/video\/(\d{15,22})/);
      if (idMatch) {
        return `https://www.tiktok.com/@tiktok/video/${idMatch[1]}`;
      }
    }

    if (window.location.href.includes("/video/")) {
      return window.location.href;
    }

    return null;
  }

  async function fetchCleanVideoUrl(postUrl) {
    try {
      const endpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(postUrl)}&hd=1`;
      const res = await fetch(endpoint);
      if (!res.ok) return null;

      const data = await res.json();
      if (data.code === 0 && data.data) {
        // Return HD watermark-free link or standard watermark-free link
        const cleanUrl = data.data.hdplay || data.data.play;
        const author = data.data.author?.unique_id || "tiktok";
        const id = data.data.id || Date.now();
        return {
          url: cleanUrl.startsWith("http") ? cleanUrl : `https://www.tikwm.com${cleanUrl}`,
          filename: `tiktok_${author}_${id}_nowm.mp4`
        };
      }
    } catch (e) {}
    return null;
  }

  async function triggerDownload(btn, videoEl) {
    const postUrl = getPostUrl(videoEl);

    if (!postUrl) {
      markButtonFailed(btn, "URL not found");
      return;
    }

    btn.className = "tt-dl-btn tt-dl-loading";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
      <span>Bypassing WM...</span>
    `;

    const result = await fetchCleanVideoUrl(postUrl);

    if (!result || !result.url) {
      markButtonFailed(btn, "Extraction failed");
      return;
    }

    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
      <span>Downloading...</span>
    `;

    chrome.runtime.sendMessage(
      {
        action: "download_clean_video",
        url: result.url,
        filename: result.filename
      },
      (res) => {
        if (res && res.success) {
          btn.className = "tt-dl-btn tt-dl-success";
          btn.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
            <span>Saved Clean!</span>
          `;
          setTimeout(() => resetButton(btn), 3000);
        } else {
          // Direct link fallback
          window.open(result.url, "_blank");
          btn.className = "tt-dl-btn tt-dl-success";
          btn.innerHTML = `<span>Opened</span>`;
          setTimeout(() => resetButton(btn), 3000);
        }
      }
    );
  }

  function markButtonFailed(btn, label) {
    btn.className = "tt-dl-btn tt-dl-error";
    btn.innerHTML = `<span>${label || "Failed"}</span>`;
    setTimeout(() => resetButton(btn), 3000);
  }

  function resetButton(btn) {
    btn.className = "tt-dl-btn";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
      <span>Download</span>
    `;
  }

  function attachButton(videoEl) {
    let container = videoEl.parentElement;
    while (
      container &&
      container !== document.body &&
      window.getComputedStyle(container).position === "static"
    ) {
      container = container.parentElement;
    }

    if (!container || container === document.body) {
      container = videoEl.parentElement;
      if (container) {
        container.style.position = "relative";
      }
    }

    if (!container) return;

    if (container.querySelector(":scope > .tt-dl-btn-container")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "tt-dl-btn-container";

    const btn = document.createElement("button");
    btn.className = "tt-dl-btn";
    resetButton(btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerDownload(btn, videoEl);
    });

    wrapper.appendChild(btn);
    container.appendChild(wrapper);
  }

  function scan() {
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      const rect = video.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 120) {
        attachButton(video);
      }
    });
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(scan, 800);
  scan();
})();