const clocks = Array.from(document.querySelectorAll("time[data-zone]"), element => ({
  element,
  formatter: new Intl.DateTimeFormat("zh-CN", {
    timeZone: element.dataset.zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
}));

function updateClocks() {
  const now = new Date();
  for (const { element, formatter } of clocks) {
    element.dateTime = now.toISOString();
    element.textContent = formatter.format(now);
  }
}

updateClocks();
setInterval(updateClocks, 1000);
