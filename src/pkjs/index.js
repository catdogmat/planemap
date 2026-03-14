var MAX_PLANES = 20;
var current_radius = 15;

function getPlanes() {
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;

      var api_endpoint = "https://api.adsb.lol/v2/";
      var fetch_radius = current_radius + 5;
      var url = api_endpoint + 'lat/' + lat + '/lon/' + lon + '/dist/' + fetch_radius;
      
      var xhr = new XMLHttpRequest();
      xhr.onload = function() {
        var json = JSON.parse(this.responseText);
        var planes = json.ac;
        
        if (!planes) {
          Pebble.sendAppMessage({ 'KEY_STATUS': 'No Planes' });
          return;
        }

        var buffer = [];
        var count = 0;
        
        for (var i = 0; i < planes.length && count < MAX_PLANES; i++) {
          var p = planes[i];
          if (!p.lat || !p.lon) continue;
          
          var dy = (p.lat - lat) * 60;
          var dx = (p.lon - lon) * 60 * Math.cos(lat * Math.PI / 180);
          
          var distance = Math.sqrt(dx*dx + dy*dy);
          var distance_nm_x10 = Math.round(distance * 10);
          
          var bearing_rad = Math.atan2(dx, dy); 
          var bearing_deg = Math.round(bearing_rad * 180 / Math.PI);
          if (bearing_deg < 0) bearing_deg += 360;

          if (distance <= 60) {
             buffer.push(distance_nm_x10 & 0xFF);
             buffer.push((distance_nm_x10 >> 8) & 0xFF);
             
             buffer.push(bearing_deg & 0xFF);
             buffer.push((bearing_deg >> 8) & 0xFF);
             
             var h = p.track || 0; 
             buffer.push(h & 0xFF);
             buffer.push((h >> 8) & 0xFF);
             
             var f = p.flight || "";
             for(var j=0; j<8; j++) buffer.push(j < f.length ? f.charCodeAt(j) : 0);
             
             var t = p.t || "";
             for(var j=0; j<4; j++) buffer.push(j < t.length ? t.charCodeAt(j) : 0);
             
             var r = p.r || "";
             for(var j=0; j<8; j++) buffer.push(j < r.length ? r.charCodeAt(j) : 0);

             var alt = (p.alt_baro === "ground") ? 0 : (p.alt_baro || 0);
             buffer.push(alt & 0xFF);
             buffer.push((alt >> 8) & 0xFF);
             buffer.push((alt >> 16) & 0xFF);
             buffer.push((alt >> 24) & 0xFF);

             var gs = Math.round(p.gs || 0);
             buffer.push(gs & 0xFF);
             buffer.push((gs >> 8) & 0xFF);

             count++;
          }
        }
        
        Pebble.sendAppMessage({ 
          'PLANES_DATA': buffer,
          'KEY_STATUS': count + ' Planes ' + current_radius + 'nm',
          'KEY_CURRENT_RADIUS': current_radius
        });
      };
      xhr.open('GET', url);
      xhr.send();
    },
    function(err) {
      console.log('Location error');
      Pebble.sendAppMessage({ 'KEY_STATUS': 'Loc Error' });
    },
    { timeout: 15000, maximumAge: 60000 }
  );
}

Pebble.addEventListener('appmessage', function(e) {
  var dict = e.payload;
  if (dict.KEY_ZOOM_IN) {
    if (current_radius > 5) current_radius -= 5;
    getPlanes();
  } else if (dict.KEY_ZOOM_OUT) {
    if (current_radius < 50) current_radius += 5;
    getPlanes();
  }
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (e && !e.response) {
    return;
  }
  var dict = clay.getSettings(e.response);
  clay.setSettings(dict);
  getPlanes();
});

Pebble.addEventListener('ready', function() {
  getPlanes();

  setInterval(getPlanes, 5000);
});