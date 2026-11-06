// Open the deployed site in a normal tab, where its inline application and map SDK can run.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'https://kjschaos.github.io/location-tracker/' });
});
