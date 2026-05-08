(function () {
  if (localStorage.getItem('hs_prefer_desktop') === 'true') return;
  var ua = navigator.userAgent;
  var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    (window.innerWidth <= 768 && navigator.maxTouchPoints > 0);
  if (mobile) window.location.replace('/mobile/');
}());
