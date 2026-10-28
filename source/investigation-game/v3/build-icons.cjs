const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../.local/redesign-20261013/runtime/web/node_modules/@phosphor-icons/core/assets/regular');
const source = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const names = [...new Set([...source.matchAll(/data-icon="([a-z-]+)"/g)].map(match => match[1]))];
const icons = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, name + '.svg'), 'utf8').replace(/fill="#0{6}"/g, 'fill="currentColor"').replace(/<svg /, '<svg aria-hidden="true" focusable="false" ')]));
fs.writeFileSync(path.join(__dirname, 'icons.js'), '(function(){"use strict";const icons=' + JSON.stringify(icons) + ';const render=()=>document.querySelectorAll("[data-icon]").forEach(el=>{const svg=icons[el.dataset.icon];if(svg&&!el.querySelector("svg"))el.innerHTML=svg;});window.FactorLabIcons={render};render();})();\n');
process.stdout.write(JSON.stringify({family:'Phosphor',version:'2.1.1',license:'MIT',icons:names.length}) + '\n');
