#include <pebble.h>

static Window *s_window;
static Window *s_list_window;
static Window *s_detail_window;
static ScrollLayer *s_detail_scroll_layer;
static TextLayer *s_text_layer;
static TextLayer *s_detail_text_layer;
static Layer *s_radar_layer;
static MenuLayer *s_menu_layer;
static int s_selected_plane_index = 0;

static Window *s_splash_window;
static TextLayer *s_splash_title_layer;
static TextLayer *s_splash_subtitle_layer;

static char s_route_str[64];

typedef struct __attribute__((__packed__)) {
  uint16_t distance_nm_x10;
  uint16_t bearing_deg;
  uint16_t heading;
  char flight[8];
  char type[16];
  char reg[8];
  int32_t alt;
  uint16_t speed;
} PlaneData;


#define MAX_PLANES 20
static PlaneData s_planes[MAX_PLANES];
static int s_num_planes = 0;
static int s_current_radius = 15;
static bool s_is_metric = false;
static void draw_plane(GContext *ctx, GPoint center, uint16_t heading_deg) {
  int32_t angle = (TRIG_MAX_ANGLE * heading_deg) / 360;
  
  int f_len = 6; 
  int f_dx = (sin_lookup(angle) * f_len) / TRIG_MAX_RATIO;
  int f_dy = (-cos_lookup(angle) * f_len) / TRIG_MAX_RATIO;
  
  int32_t wing_angle = angle + (TRIG_MAX_ANGLE / 4);
  
  int w_offset = 1;
  int w_off_dx = (sin_lookup(angle) * w_offset) / TRIG_MAX_RATIO;
  int w_off_dy = (-cos_lookup(angle) * w_offset) / TRIG_MAX_RATIO;
  GPoint w_pos = GPoint(center.x + w_off_dx, center.y + w_off_dy);

  int w_len = 5;
  int w_dx = (sin_lookup(wing_angle) * w_len) / TRIG_MAX_RATIO;
  int w_dy = (-cos_lookup(wing_angle) * w_len) / TRIG_MAX_RATIO;
  
  int t_offset = 5;
  int t_off_dx = (sin_lookup(angle) * t_offset) / TRIG_MAX_RATIO;
  int t_off_dy = (-cos_lookup(angle) * t_offset) / TRIG_MAX_RATIO;
  GPoint t_pos = GPoint(center.x - t_off_dx, center.y - t_off_dy);

  int t_len = 2;
  int t_dx = (sin_lookup(wing_angle) * t_len) / TRIG_MAX_RATIO;
  int t_dy = (-cos_lookup(wing_angle) * t_len) / TRIG_MAX_RATIO;

  graphics_draw_line(ctx, 
      GPoint(center.x - f_dx, center.y - f_dy),
      GPoint(center.x + f_dx, center.y + f_dy)
  );
  
  graphics_draw_line(ctx, 
      GPoint(w_pos.x - w_dx, w_pos.y - w_dy),
      GPoint(w_pos.x + w_dx, w_pos.y + w_dy) 
  );

  graphics_draw_line(ctx, 
      GPoint(t_pos.x - t_dx, t_pos.y - t_dy), 
      GPoint(t_pos.x + t_dx, t_pos.y + t_dy)
  );
}

static void radar_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  GPoint center = grect_center_point(&bounds);

  // Draw Radar Scope (radius mapped to 72px)
  graphics_context_set_stroke_color(ctx, GColorGreen);
  graphics_context_set_text_color(ctx, GColorGreen);
  
  // Draw N/S/E/W
  graphics_draw_text(ctx, "N", fonts_get_system_font(FONT_KEY_GOTHIC_14), GRect(center.x - 10, 2, 20, 20), GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
  graphics_draw_text(ctx, "S", fonts_get_system_font(FONT_KEY_GOTHIC_14), GRect(center.x - 10, bounds.size.h - 18, 20, 20), GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
  graphics_draw_text(ctx, "W", fonts_get_system_font(FONT_KEY_GOTHIC_14), GRect(2, center.y - 10, 20, 20), GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
  graphics_draw_text(ctx, "E", fonts_get_system_font(FONT_KEY_GOTHIC_14), GRect(bounds.size.w - 22, center.y - 10, 20, 20), GTextOverflowModeWordWrap, GTextAlignmentRight, NULL);

  // Draw current radius in corner
  static char s_radius_buf[16];
  snprintf(s_radius_buf, sizeof(s_radius_buf), "%d %s", s_current_radius, s_is_metric ? "km" : "nm");
  graphics_draw_text(ctx, s_radius_buf, fonts_get_system_font(FONT_KEY_GOTHIC_14), GRect(4, 2, 40, 20), GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);

  graphics_draw_circle(ctx, center, 72);
  graphics_draw_circle(ctx, center, 48);
  graphics_draw_circle(ctx, center, 24);
  graphics_draw_line(ctx, GPoint(center.x, 0), GPoint(center.x, bounds.size.h));
  graphics_draw_line(ctx, GPoint(0, center.y), GPoint(bounds.size.w, center.y));

  graphics_context_set_stroke_color(ctx, GColorWhite);
  graphics_context_set_text_color(ctx, GColorWhite);
  for (int i = 0; i < s_num_planes; i++) {
    int px_distance = (s_planes[i].distance_nm_x10 * (72 / s_current_radius)) / 10;
    int32_t b_angle = (TRIG_MAX_ANGLE * s_planes[i].bearing_deg) / 360;
    int px_x = center.x + (sin_lookup(b_angle) * px_distance) / TRIG_MAX_RATIO;
    int px_y = center.y - (cos_lookup(b_angle) * px_distance) / TRIG_MAX_RATIO;
    GPoint p = GPoint(px_x, px_y);
    
    if (px_x < -20 || px_x > bounds.size.w + 20 || px_y < -20 || px_y > bounds.size.h + 20) continue;
    
    draw_plane(ctx, p, s_planes[i].heading);
    
    char flight_buf[9] = {0};
    memcpy(flight_buf, s_planes[i].flight, 8);
    graphics_draw_text(ctx, flight_buf, fonts_get_system_font(FONT_KEY_GOTHIC_14), GRect(p.x + 6, p.y - 10, 50, 14), GTextOverflowModeWordWrap, GTextAlignmentLeft, NULL);
  }
}

static void detail_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_detail_scroll_layer = scroll_layer_create(bounds);
  scroll_layer_set_click_config_onto_window(s_detail_scroll_layer, window);
  
  // Create the text layer with a large height limit
  s_detail_text_layer = text_layer_create(GRect(5, 5, bounds.size.w - 10, 2000));
  text_layer_set_font(s_detail_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_overflow_mode(s_detail_text_layer, GTextOverflowModeWordWrap);
  
  if(s_selected_plane_index < s_num_planes) {
    PlaneData *p = &s_planes[s_selected_plane_index];
    
    static char s_buff[160];
    char f_safe[9] = {0}; memcpy(f_safe, p->flight, 8);
    char t_safe[17] = {0}; memcpy(t_safe, p->type, 16);
    char r_safe[9] = {0}; memcpy(r_safe, p->reg, 8);

    snprintf(s_buff, sizeof(s_buff), 
      "Flight: %s\nRoute: %s\nType: %s\nReg: %s\nAlt: %ld %s\nSpd: %d %s",
      f_safe, s_route_str, t_safe, r_safe, (long)p->alt, s_is_metric ? "m" : "ft", (int)p->speed, s_is_metric ? "kmh" : "kts");
      
    text_layer_set_text(s_detail_text_layer, s_buff);
    
    // Resize the text layer and scroll layer content
    GSize text_size = text_layer_get_content_size(s_detail_text_layer);
    text_layer_set_size(s_detail_text_layer, GSize(bounds.size.w - 10, text_size.h + 10));
    scroll_layer_set_content_size(s_detail_scroll_layer, GSize(bounds.size.w, text_size.h + 20));
  }
  
  scroll_layer_add_child(s_detail_scroll_layer, text_layer_get_layer(s_detail_text_layer));
  layer_add_child(window_layer, scroll_layer_get_layer(s_detail_scroll_layer));
}

static void detail_window_unload(Window *window) {
  text_layer_destroy(s_detail_text_layer);
  scroll_layer_destroy(s_detail_scroll_layer);
}

static void menu_select_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *data) {
  s_selected_plane_index = cell_index->row;
  
  snprintf(s_route_str, sizeof(s_route_str), "Loading...");
  
  PlaneData *p = &s_planes[s_selected_plane_index];
  char f_safe[9] = {0}; 
  memcpy(f_safe, p->flight, 8);
  
  DictionaryIterator *iter;
  if(app_message_outbox_begin(&iter) == APP_MSG_OK) {
     dict_write_cstring(iter, MESSAGE_KEY_KEY_REQUEST_ROUTE, f_safe);
     app_message_outbox_send();
  }

  window_stack_push(s_detail_window, true);
}

static uint16_t menu_get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *data) {
  return s_num_planes;
}

static void menu_draw_row_callback(GContext* ctx, const Layer *cell_layer, MenuIndex *cell_index, void *data) {
  if (cell_index->row >= s_num_planes) return;
  
  PlaneData *p = &s_planes[cell_index->row];
  
  char f_str[9] = {0};
  memcpy(f_str, p->flight, 8);
  
  char t_str[17] = {0};
  memcpy(t_str, p->type, 16);
  
  static char s_title[32];
  snprintf(s_title, sizeof(s_title), "#%d %s", cell_index->row + 1, f_str);
  
  static char s_sub[32];
  snprintf(s_sub, sizeof(s_sub), "Type: %s", t_str);

  menu_cell_basic_draw(ctx, cell_layer, s_title, s_sub, NULL);
}

static void prv_list_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_menu_layer = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_rows = menu_get_num_rows_callback,
    .draw_row = menu_draw_row_callback,
    .select_click = menu_select_callback,
  });
  menu_layer_set_click_config_onto_window(s_menu_layer, window);
  layer_add_child(window_layer, menu_layer_get_layer(s_menu_layer));
}

static void prv_list_window_unload(Window *window) {
  menu_layer_destroy(s_menu_layer);
  s_menu_layer = NULL;
}


static void prv_inbox_received_handler(DictionaryIterator *iter, void *context) {
  Tuple *status_t = dict_find(iter, MESSAGE_KEY_KEY_STATUS);
  if (status_t) {
    text_layer_set_text(s_text_layer, status_t->value->cstring);
  }

  Tuple *route_t = dict_find(iter, MESSAGE_KEY_ROUTE_DATA);
  if (route_t) {
    snprintf(s_route_str, sizeof(s_route_str), "%s", route_t->value->cstring);
    if(window_stack_get_top_window() == s_detail_window) {
       // Refresh detail window if it is currently open
       detail_window_load(s_detail_window);
    }
  }

  Tuple *planes_t = dict_find(iter, MESSAGE_KEY_PLANES_DATA);
  if (planes_t) {
    uint8_t *data = planes_t->value->data;
    int count = planes_t->length / sizeof(PlaneData);
    if (count > MAX_PLANES) count = MAX_PLANES;

    memcpy(s_planes, data, count * sizeof(PlaneData));
    s_num_planes = count;

    Tuple *radius_t = dict_find(iter, MESSAGE_KEY_KEY_CURRENT_RADIUS);
    if (radius_t) {
      s_current_radius = radius_t->value->int32;
    }

    Tuple *metric_t = dict_find(iter, MESSAGE_KEY_KEY_IS_METRIC);
    if (metric_t) {
      s_is_metric = metric_t->value->int32 == 1;
    }

    layer_mark_dirty(s_radar_layer);
    
    if (s_menu_layer) {
      menu_layer_reload_data(s_menu_layer);
    }

    static char s_buf[32];
    snprintf(s_buf, sizeof(s_buf), "%d Planes", count);
    text_layer_set_text(s_text_layer, s_buf);
  }
}

static void select_click_handler(ClickRecognizerRef recognizer, void *context) {
  window_stack_push(s_list_window, true);
}

static void send_zoom_message(uint32_t key) {
  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);
  if (!iter) return;
  dict_write_uint8(iter, key, 1);
  app_message_outbox_send();
}

static void up_click_handler(ClickRecognizerRef recognizer, void *context) {
  if (s_current_radius > 5) {
    s_current_radius -= 5;
    layer_mark_dirty(s_radar_layer);
  }
  send_zoom_message(MESSAGE_KEY_KEY_ZOOM_IN);
}

static void down_click_handler(ClickRecognizerRef recognizer, void *context) {
  if (s_current_radius < 50) {
    s_current_radius += 5;
    layer_mark_dirty(s_radar_layer);
  }
  send_zoom_message(MESSAGE_KEY_KEY_ZOOM_OUT);
}

static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
  window_single_click_subscribe(BUTTON_ID_UP, up_click_handler);
  window_single_click_subscribe(BUTTON_ID_DOWN, down_click_handler);
}

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_radar_layer = layer_create(bounds);
  layer_set_update_proc(s_radar_layer, radar_update_proc);
  layer_add_child(window_layer, s_radar_layer);

  s_text_layer = text_layer_create(GRect(0, 148, bounds.size.w, 20));
  text_layer_set_text(s_text_layer, "Loading...");
  text_layer_set_text_alignment(s_text_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_text_layer, GColorClear);
  text_layer_set_text_color(s_text_layer, GColorWhite);
  layer_add_child(window_layer, text_layer_get_layer(s_text_layer));

  window_set_background_color(window, GColorBlack);
  
  window_set_click_config_provider(window, click_config_provider);
}

static void prv_window_unload(Window *window) {
  text_layer_destroy(s_text_layer);
  layer_destroy(s_radar_layer);
}

static void splash_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  window_set_background_color(window, GColorBlack);

  s_splash_title_layer = text_layer_create(GRect(0, bounds.size.h / 2 - 24, bounds.size.w + 10, 30));
  text_layer_set_text(s_splash_title_layer, "PlaneMap");
  text_layer_set_text_alignment(s_splash_title_layer, GTextAlignmentCenter);
  text_layer_set_font(s_splash_title_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28));
  text_layer_set_text_color(s_splash_title_layer, GColorWhite);
  text_layer_set_background_color(s_splash_title_layer, GColorClear);
  layer_add_child(window_layer, text_layer_get_layer(s_splash_title_layer));

  s_splash_subtitle_layer = text_layer_create(GRect(0, bounds.size.h / 2 + 10, bounds.size.w, 30));
  text_layer_set_text(s_splash_subtitle_layer, "data provided by adsb.lol");
  text_layer_set_text_alignment(s_splash_subtitle_layer, GTextAlignmentCenter);
  text_layer_set_font(s_splash_subtitle_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14));
  text_layer_set_text_color(s_splash_subtitle_layer, GColorWhite);
  text_layer_set_background_color(s_splash_subtitle_layer, GColorClear);
  layer_add_child(window_layer, text_layer_get_layer(s_splash_subtitle_layer));
}

static void splash_window_unload(Window *window) {
  text_layer_destroy(s_splash_title_layer);
  text_layer_destroy(s_splash_subtitle_layer);
}

static void splash_timer_callback(void *data) {
  window_stack_remove(s_splash_window, true);
}

static void prv_init(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });
  
  s_list_window = window_create();
  window_set_window_handlers(s_list_window, (WindowHandlers) {
    .load = prv_list_window_load,
    .unload = prv_list_window_unload,
  });
  
  s_detail_window = window_create();
  window_set_window_handlers(s_detail_window, (WindowHandlers) {
    .load = detail_window_load,
    .unload = detail_window_unload,
  });

  s_splash_window = window_create();
  window_set_window_handlers(s_splash_window, (WindowHandlers) {
    .load = splash_window_load,
    .unload = splash_window_unload,
  });

  const bool animated = true;
  window_stack_push(s_window, false);
  window_stack_push(s_splash_window, animated);

  app_timer_register(2000, splash_timer_callback, NULL);

  app_message_register_inbox_received(prv_inbox_received_handler);

  const uint32_t inbox_size = 1024;
  const uint32_t outbox_size = 64;
  AppMessageResult result = app_message_open(inbox_size, outbox_size);
  if (result != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Error opening AppMessage: %d", result);
  }
}

static void prv_deinit(void) {
  app_message_deregister_callbacks();

  window_destroy(s_window);
  window_destroy(s_list_window);
  window_destroy(s_detail_window);
  window_destroy(s_splash_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
