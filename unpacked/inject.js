(function () {
  const originalGUM = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async function (c) {
    window.postMessage({ type: "GUARDRAIL_MEDIA_INTERNAL" }, window.location.origin);
    return originalGUM(c);
  };
})();
