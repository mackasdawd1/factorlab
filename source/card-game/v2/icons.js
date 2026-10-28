(function(root){
  const icons={
    chip:'<rect x="7" y="7" width="18" height="18" rx="3"/><rect x="12" y="12" width="8" height="8" rx="1"/><path d="M11 3v4m10-4v4M11 25v4m10-4v4M3 11h4m-4 10h4m18-10h4m-4 10h4"/>',
    robot:'<rect x="5" y="10" width="22" height="16" rx="5"/><path d="M16 10V5m-3 16h6M1 16v5m30-5v5"/><circle cx="16" cy="4" r="1"/><circle cx="11" cy="16" r="1"/><circle cx="21" cy="16" r="1"/>',
    hex:'<path d="m16 3 12 7v13l-12 7L4 23V10Zm0 0v13m-12-6 12 6 12-6M16 16v14"/>',
    sun:'<circle cx="16" cy="16" r="6"/><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3"/>',
    network:'<circle cx="16" cy="16" r="4"/><circle cx="5" cy="6" r="3"/><circle cx="27" cy="6" r="3"/><circle cx="5" cy="26" r="3"/><circle cx="27" cy="26" r="3"/><path d="m7 8 6 5m6 6 6 5m-6-11 6-5M7 24l6-5"/>',
    coins:'<ellipse cx="16" cy="8" rx="11" ry="5"/><path d="M5 8v8c0 7 22 7 22 0V8M5 16v8c0 7 22 7 22 0v-8"/>',
    bolt:'<path d="m19 2-14 18h10l-2 10 14-18H17Z"/>',
    scan:'<path d="M11 3H4v7m17-7h7v7M4 22v7h7m17-7v7h-7M9 16h14"/><circle cx="16" cy="16" r="7"/>',
    sliders:'<path d="M8 3v10m0 6v10M24 3v4m0 6v16M3 16h10M19 10h10"/><circle cx="8" cy="16" r="3"/><circle cx="24" cy="10" r="3"/>',
    up:'<path d="M5 24 15 14l6 4 7-11M20 7h8v8"/>',
    down:'<path d="M5 8 15 18l6-4 7 11M20 25h8v-8"/>',
    rotate:'<path d="M5 11h22l-6-6m6 16H5l6 6M5 11l6 6m-6 4 6-6"/>',
    spread:'<circle cx="16" cy="7" r="4"/><path d="M16 11v7M5 25v-7h22v7m-11-7v7"/>',
    shield:'<path d="m16 3 11 5v9c0 6-7 10-11 12C12 27 5 23 5 17V8Z"/><path d="m10 16 4 4 8-9"/>',
    eye:'<path d="M2 16C8 4 24 4 30 16 24 28 8 28 2 16Z"/><circle cx="16" cy="16" r="4"/>'
  };
  const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.hex}</svg>`;

root.duelIcon=icon;
})(window);
