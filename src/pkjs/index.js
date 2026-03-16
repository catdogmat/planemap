var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig);

var MAX_PLANES = 20;
var current_radius = 15;
try {
  var saved_radius = localStorage.getItem('current_radius');
  if (saved_radius) {
    var parsed = parseInt(saved_radius, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 250) {
      current_radius = parsed;
    }
  }
} catch (e) { }

var icaoDict = require('./icao_dict.json');

function fetchPlanesWithPos(lat, lon) {
  var isMetric = false;
  var rotateMap = false;
  try {
    var claySettingsStr = localStorage.getItem('clay-settings');
    if (claySettingsStr) {
      var settings = JSON.parse(claySettingsStr);
      if (settings.UNITS_METRIC) {
        isMetric = true;
      }
      if (settings.ROTATE_MAP) {
        rotateMap = true;
      }
      if (settings.MAX_PLANES !== undefined) {
        MAX_PLANES = parseInt(settings.MAX_PLANES, 10) || 20;
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

    var valid_planes = [];
    for (var i = 0; i < planes.length; i++) {
      var p = planes[i];
      if (!p.lat || !p.lon) continue;
      
      var dy = (p.lat - lat) * 60;
      var dx = (p.lon - lon) * 60 * Math.cos(lat * Math.PI / 180);
      
      var distance = Math.sqrt(dx*dx + dy*dy);
      
      if (distance <= fetch_radius_nm) {
        p._dist = distance;
        p._dx = dx;
        p._dy = dy;
        valid_planes.push(p);
      }
    }
    
    valid_planes.sort(function(a, b) {
      return a._dist - b._dist;
    });

    var total_valid_planes = valid_planes.length;

    var buffer = [];
    var count = 0;
    
    for (var i = 0; i < valid_planes.length && count < MAX_PLANES; i++) {
      var p = valid_planes[i];
      var distance = p._dist;
      var dx = p._dx;
      var dy = p._dy;
      
      var out_dist = isMetric ? (distance * 1.852) : distance;
      var out_alt = (p.alt_baro === "ground") ? 0 : (p.alt_baro || 0);
      if (isMetric) out_alt = out_alt * 0.3048;
      
      var out_gs = (p.gs || 0);
      if (isMetric) out_gs = out_gs * 1.852;
      
      var distance_x10 = Math.round(out_dist * 10);
      
      var bearing_rad = Math.atan2(dx, dy); 
      var bearing_deg = Math.round(bearing_rad * 180 / Math.PI);
      if (bearing_deg < 0) bearing_deg += 360;

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
    var status_str = (total_valid_planes > MAX_PLANES) ? 
                     count + '* Planes' : 
                     count + ' Planes';

    Pebble.sendAppMessage({ 
      'PLANES_DATA': buffer,
      'KEY_STATUS': status_str,
      'KEY_CURRENT_RADIUS': current_radius,
      'UNITS_METRIC': isMetric ? 1 : 0,
      'ROTATE_MAP': rotateMap ? 1 : 0
    }, function(e) {
      console.log('Successfully delivered message with ' + count + ' planes');
    }, function(e) {
      console.log('Unable to deliver message with ' + count + ' planes: ' + JSON.stringify(e));
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
  if ('KEY_CURRENT_RADIUS' in dict) {
    current_radius = dict.KEY_CURRENT_RADIUS;
    try { localStorage.setItem('current_radius', current_radius); } catch(e) {}
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

var fetchInterval = null;

Pebble.addEventListener('ready', function() {
  if (fetchInterval) clearInterval(fetchInterval);
  getPlanes();
  fetchInterval = setInterval(getPlanes, 5000);
});