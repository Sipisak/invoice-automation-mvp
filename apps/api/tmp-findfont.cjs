const fs = require('fs');
const dirs = [
  ['', 'System', 'Library', 'Fonts', 'Supplemental'].join('/'),
  ['', 'Library', 'Fonts'].join('/'),
  ['', 'System', 'Library', 'Fonts'].join('/'),
];
for (const d of dirs) {
  try {
    const f = fs.readdirSync(d).filter((x) => /\.ttf$/i.test(x) && /arial|dejavu|verdana|tahoma|times|georgia/i.test(x));
    console.log(d, JSON.stringify(f));
  } catch (e) {
    console.log(d, 'ERR', e.code);
  }
}
