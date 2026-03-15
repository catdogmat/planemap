var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig);

var MAX_PLANES = 20;
var current_radius = 15;

var icaoDict = require('./icao_dict.json');

function fetchPlanesWithPos(lat, lon) {
  var isMetric = false;
  try {
    var claySettingsStr = localStorage.getItem('clay-settings');
    if (claySettingsStr) {
      var settings = JSON.parse(claySettingsStr);
      if (settings.UNITS_METRIC) {
        isMetric = true;
      }
    }
  } catch (e) {
    console.log("Error loading settings: " + e);
  }

  var api_endpoint = "https://api.adsb.lol/v2/";
  
  var fetch_radius_nm = isMetric ? (current_radius / 1.852) : current_radius;
  fetch_radius_nm = fetch_radius_nm + 5; 

  var url = api_endpoint + 'lat/' + lat + '/lon/' + lon + '/dist/' + fetch_radius_nm;
  
  var xhr = new XMLHttpRequest();
  xhr.onload = function() {
    var json = JSON.parse(this.responseText);
    var planes = json.ac;
    
    if (!planes) {
      Pebble.sendAppMessage({ 'KEY_STATUS': 'No Planes', 'KEY_IS_METRIC': isMetric ? 1 : 0 });
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
      
      var out_dist = isMetric ? (distance * 1.852) : distance;
      var out_alt = (p.alt_baro === "ground") ? 0 : (p.alt_baro || 0);
      if (isMetric) out_alt = out_alt * 0.3048;
      
      var out_gs = (p.gs || 0);
      if (isMetric) out_gs = out_gs * 1.852;
      
      var distance_x10 = Math.round(out_dist * 10);
      
      var bearing_rad = Math.atan2(dx, dy); 
      var bearing_deg = Math.round(bearing_rad * 180 / Math.PI);
      if (bearing_deg < 0) bearing_deg += 360;

      if (distance <= fetch_radius_nm) {
         buffer.push(distance_x10 & 0xFF);
         buffer.push((distance_x10 >> 8) & 0xFF);
         
         buffer.push(bearing_deg & 0xFF);
         buffer.push((bearing_deg >> 8) & 0xFF);
         
         var h = p.track || 0; 
         buffer.push(h & 0xFF);
         buffer.push((h >> 8) & 0xFF);
         
         var f = p.flight || "";
         for(var j=0; j<8; j++) buffer.push(j < f.length ? f.charCodeAt(j) : 0);
         
         var t_raw = p.t || "";
         var t_full = icaoDict[t_raw] ? icaoDict[t_raw] : t_raw;
         
         for(var j=0; j<16; j++) buffer.push(j < t_full.length ? t_full.charCodeAt(j) : 0);
         
         var r = p.r || "";
         for(var j=0; j<8; j++) buffer.push(j < r.length ? r.charCodeAt(j) : 0);

         var alt_int = Math.round(out_alt);
         buffer.push(alt_int & 0xFF);
         buffer.push((alt_int >> 8) & 0xFF);
         buffer.push((alt_int >> 16) & 0xFF);
         buffer.push((alt_int >> 24) & 0xFF);

         var gs_int = Math.round(out_gs);
         buffer.push(gs_int & 0xFF);
         buffer.push((gs_int >> 8) & 0xFF);

         count++;
      }
    }
    
    var unit_str = isMetric ? "km" : "nm";
    Pebble.sendAppMessage({ 
      'PLANES_DATA': buffer,
      'KEY_STATUS': count + ' Planes ' + current_radius + unit_str,
      'KEY_CURRENT_RADIUS': current_radius,
      'KEY_IS_METRIC': isMetric ? 1 : 0
    });
  };
  xhr.open('GET', url);
  xhr.send();
}

function getPlanes() {
  try {
    var claySettingsStr = localStorage.getItem('clay-settings');
    if (claySettingsStr) {
      var settings = JSON.parse(claySettingsStr);
      if (settings.OVERRIDE_LOCATION && settings.MANUAL_LAT && settings.MANUAL_LON) {
        var fixLat = parseFloat(settings.MANUAL_LAT);
        var fixLon = parseFloat(settings.MANUAL_LON);
        if (!isNaN(fixLat) && !isNaN(fixLon)) {
          fetchPlanesWithPos(fixLat, fixLon);
          return;
        }
      }
    }
  } catch (e) {
    console.log("Error loading settings: " + e);
  }

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      fetchPlanesWithPos(pos.coords.latitude, pos.coords.longitude);
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
  } else if (dict.KEY_REQUEST_ROUTE) {
    var callsign = dict.KEY_REQUEST_ROUTE;
    if (!callsign || callsign.trim() === "") {
        Pebble.sendAppMessage({ 'ROUTE_DATA': 'Unknown Route' });
        return;
    }
    
    var route_url = "https://api.adsbdb.com/v0/callsign/" + callsign.trim();
    var route_xhr = new XMLHttpRequest();
    route_xhr.onload = function() {
        if (this.status === 200) {
            try {
                var rJson = JSON.parse(this.responseText);
                var route = rJson.response.flightroute;
                if (route && route.origin && route.destination) {
                    var o = route.origin.iata_code || route.origin.icao_code;
                    var d = route.destination.iata_code || route.destination.icao_code;
                    Pebble.sendAppMessage({ 'ROUTE_DATA': o + ' -> ' + d });
                    return;
                }
            } catch(e) {
                console.log("Error parsing route: " + e);
            }
        }
        Pebble.sendAppMessage({ 'ROUTE_DATA': 'Unknown Route' });
    };
    route_xhr.onerror = function() {
        Pebble.sendAppMessage({ 'ROUTE_DATA': 'Unknown Route' });
    };
    route_xhr.open('GET', route_url);
    route_xhr.send();
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