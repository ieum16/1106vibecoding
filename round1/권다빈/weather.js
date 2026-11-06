const weatherOptions = [
  { icon: "☀️", label: "맑음" },
  { icon: "☁️", label: "흐림" },
  { icon: "🌧️", label: "비" },
  { icon: "❄️", label: "눈" },
];

const weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
document.querySelector("#weather-icon").textContent = weather.icon;
document.querySelector("#weather-label").textContent = weather.label;
