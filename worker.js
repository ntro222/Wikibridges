export default {
  async fetch(request) {
    const url = new URL(request.url);
    const userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 6_1_3 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10B329 Safari/8536.25";

    // --- 1. IMAGE PROXY ---
    if (url.pathname.startsWith("/proxy-img/")) {
      let realImgUrl = decodeURIComponent(url.pathname.replace("/proxy-img/", ""));
      if (realImgUrl.startsWith("//")) realImgUrl = "https:" + realImgUrl;
      try {
        const imgResponse = await fetch(realImgUrl, { headers: { "User-Agent": userAgent }, redirect: "follow" });
        const newHeaders = new Headers(imgResponse.headers);
        newHeaders.set("Access-Control-Allow-Origin", "*");
        return new Response(imgResponse.body, { headers: newHeaders });
      } catch (e) {
        return new Response("Image Error", { status: 404 });
      }
    }

    // --- 2. NAVIGATION ---
    const searchTerm = url.searchParams.get("q");
    if (searchTerm) return Response.redirect(`${url.origin}/wiki/Special:Search?search=${encodeURIComponent(searchTerm)}`, 302);
    if (url.pathname === "/" || url.pathname === "") return Response.redirect(url.origin + "/wiki/Main_Page", 302);

    // --- 3. FETCH & CLEAN ---
    url.searchParams.set("useskin", "minerva");
    const response = await fetch("https://en.m.wikipedia.org" + url.pathname + url.search, { headers: { "User-Agent": userAgent } });
    let body = await response.text();

    body = body.replace(/style="text-align:\s*right;"/gi, 'style="text-align: left;"');
    body = body.replace(/<(script|noscript|style|footer|audio|video|canvas)[^>]*>[\s\S]*?<\/\1>/gi, "");
    
    // Fix the stray comma after the header link
    body = body.replace(/(Welcome_to_Wikipedia">Welcome to.*?<\/a><\/h1>)\s*,\s*<\/div>/gi, '$1</div>');

    // Lazy-load & Proxy links
    body = body.replace(/<span[^>]*class="lazy-image-placeholder"[^>]*data-mw-src="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi, (m, p1) => `<img src="${p1}">`);
    body = body.replace(/data-(mw-)?src=/gi, 'src=');
    body = body.replace(/srcset="[^"]*"/gi, ''); 
    body = body.replace(/src="\/\//gi, 'src="https://');
    body = body.replace(/src="(https:\/\/[^"]+)"/gi, (m, p1) => `src="${url.origin}/proxy-img/${encodeURIComponent(p1)}"`);

    body = body.replace(/class="[^"]*collapsible-block[^"]*"/gi, 'style="display:block !important;"');
    body = body.replace(/aria-expanded="false"/gi, 'aria-expanded="true"');

    const style = `
    <style>
      * { box-sizing: border-box; -webkit-text-size-adjust: none; }
      html, body { 
        background: #fff; margin: 0; padding: 0; 
        font-family: "Linux Libertine", Georgia, Times, serif; 
        font-size: 16px; line-height: 1.5; color: #000; text-align: left;
      }
      .nav-bar { background: #fff; width: 100%; padding: 10px 0; border-bottom: 1px solid #eee; margin-bottom: 10px; }
      .nav-inner { width: 100%; max-width: 650px; padding: 0 13px; }
      .s-box input { 
        width: 100%; height: 36px; border: 1px solid #ccc; border-radius: 4px; padding: 0 10px; 
        font-family: inherit; font-size: 16px; outline: none; 
      }
      .main-content { max-width: 650px; margin: 0 auto; padding: 13px; display: block; }

      #mp-welcome { padding-top: 13px !important; }
      #Welcome_to_Wikipedia, #mp-free { text-align: center !important; width: 100%; display: block; clear: both; }
      #Welcome_to_Wikipedia { font-size: 1.6em; margin-bottom: 5px; }

      .mw-parser-output { display: block !important; }
      p { display: block; margin-bottom: 12px; overflow: visible !important; }
      
      figure, .thumb, .tfa-featured-image, .floatleft { 
        display: block !important; 
        float: left !important; 
        margin: 5px 15px 10px 0 !important; 
        width: 180px !important; 
        max-width: 45% !important; 
        background: #f9f9f9; 
        padding: 4px; 
        border: 1px solid #ddd;
        clear: none !important;
      }
      
      img { width: 100% !important; height: auto !important; display: block; border: 1px solid #eee; }
      
      /* Specific fix for sister project icons in lists */
      .mw-parser-output ul li img { 
        width: auto !important; 
        max-width: 40px !important; 
        display: inline-block !important; 
        vertical-align: middle; 
        margin-right: 8px; 
        border: none !important;
      }

      figcaption, .thumbcaption { font-size: 12px; line-height: 1.3; padding: 4px; color: #333; text-align: left; }

      ul, ol { margin: 10px 0 15px 25px; padding: 0; text-align: left; overflow: visible !important; }
      li { margin-bottom: 6px; list-style-type: disc; }
      .tfa-recent { text-align: left !important; clear: both; }

      h1, h2, h3 { clear: both; font-weight: normal; margin: 20px 0 10px 0; }
      h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; }
      a { color: #0645ad; text-decoration: none; }

      .ambox, .navbox, .infobox, .metadata, .revisions-count, #mw-mf-header, .header-container, .mw-footer, .nomobile { display: none !important; }
    </style>`;

    const ui = `<div class="nav-bar"><div class="nav-inner"><form class="s-box" action="${url.origin}/" method="GET"><input type="text" name="q" placeholder="Search Wikipedia..." autocomplete="off"></form></div></div>`;
    
    body = body.replace("<head>", "<head>" + style);
    body = body.replace(/<body[^>]*>/i, (m) => m + '<div class="main-content">');
    
    if (body.includes('id="mp-free"')) {
      body = body.replace(/(id="mp-free"[^>]*>[\s\S]*?<\/div>)/i, (m) => m + ui);
    } else {
      body = body.replace(/<div class="main-content">/i, (m) => m + ui);
    }
    
    body = body.replace("</body>", "</div></body>");

    return new Response(body, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  }
};
