const lucide = require('lucide-react');
const icons = Object.keys(lucide);
const search = ['rock', 'paper', 'scissor', 'hand', 'file', 'square', 'circle'];
for (const s of search) {
  console.log("Matches for", s, ":", icons.filter(i => i.toLowerCase().includes(s)));
}
