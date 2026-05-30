import streamlit as st
import requests
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import time
import os

# --- Configuration ---
# Use Env var if available, or localhost for dev. 
# For production (reverse proxy), it should be "https://myroom.gucchii.com/api" or full URL.
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
REFRESH_INTERVAL = 30  # seconds
APP_NAME = "myroom"

# --- Authentication ---
def check_password():
    """Returns `True` if the user had a correct password."""

    def password_entered():
        """Checks whether a password entered by the user is correct."""
        if st.session_state["password"] == os.getenv("APP_PASSWORD", "admin"):
            st.session_state["password_correct"] = True
            del st.session_state["password"]  # don't store password
        else:
            st.session_state["password_correct"] = False

    if "password_correct" not in st.session_state:
        # First run, show input for password.
        st.text_input(
            "パスワードを入力してください", type="password", on_change=password_entered, key="password"
        )
        st.write("*パスワードは環境変数 `APP_PASSWORD` で設定できます (デフォルト: admin)*")
        return False
    elif not st.session_state["password_correct"]:
        # Password not correct, show input + error.
        st.text_input(
            "パスワードを入力してください", type="password", on_change=password_entered, key="password"
        )
        st.error("😕 パスワードが違います")
        return False
    else:
        # Password correct.
        return True

# --- CSS Injection ---
def local_css(file_name):
    with open(file_name) as f:
        st.markdown(f'<style>{f.read()}</style>', unsafe_allow_html=True)

# --- API Functions ---
# Removed token argument as backend no longer requires it for read operations

@st.cache_data(ttl=60, show_spinner="データ取得中...")
def get_history(date_str=None, device=1):
    try:
        url = f"{API_BASE_URL}/history"
        params = {"device": device}
        if date_str:
            params["date"] = date_str
        
        response = requests.get(url, params=params)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        st.error(f"Error connecting to backend: {e}")
    return []

@st.cache_data(ttl=1, show_spinner="データ取得中...") # Reduced TTL to force refresh
def get_daily_stats(device=1):
    try:
        # Add timestamp to query to bust cache
        params = {"device": device, "t": time.time()}
        response = requests.get(f"{API_BASE_URL}/daily-stats", params=params)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        pass
    return []

def get_latest(device=1):
    try:
        params = {"device": device}
        response = requests.get(f"{API_BASE_URL}/latest", params=params)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        st.warning(f"Backend offline? {e}")
    return None

@st.cache_data(ttl=REFRESH_INTERVAL, show_spinner="データ取得中...")
def get_analysis_data(date_str=None, device=1):
    try:
        url = f"{API_BASE_URL}/analysis"
        params = {"device": device}
        if date_str:
            params["date"] = date_str
            
        response = requests.get(url, params=params)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        pass
    return None

# --- UI Components ---

def render_header_card(data, analysis):
    if not data:
        st.markdown("""
        <div class="hero-container">
            <div class="hero-title">現在</div>
            <div class="hero-values">
                <div class="value-group">
                    <div class="value-label">温度</div>
                    <div><span class="value-number">--</span><span class="value-unit">°C</span></div>
                </div>
                <div class="hero-divider"></div>
                <div class="value-group">
                    <div class="value-label">湿度</div>
                    <div><span class="value-number">--</span><span class="value-unit">%</span></div>
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)
        return

    # Data Freshness Check
    warning_html = ""
    if data and 'datetime' in data:
        try:
            last_dt = pd.to_datetime(data['datetime'])
            now_jst_naive = pd.Timestamp.now(tz='Asia/Tokyo').tz_localize(None)
            if (now_jst_naive - last_dt) > pd.Timedelta(hours=1):
                warning_html = """
<div style="background-color: #e74c3c; color: white; padding: 10px; border-radius: 8px; margin-top: 25px; font-weight: bold; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
⚠️ データが取得できていません。センサーを確認してください
</div>
"""
        except:
            pass

    # Calculate Comfort Status (Simple logic)
    temp = data.get('temperature', 0)
    humid = data.get('humidity', 0)
    
    # Analysis Status
    ac_mode = analysis.get('current', {}).get('ac_mode', "---") if analysis else "---"
    
    ac_text = "停止中"
    ac_color = "white" # Changed from #95a5a6 for visibility
    if ac_mode == "HEATING":
        ac_text = "暖房中"
        ac_color = "#e74c3c"
    elif ac_mode == "COOLING":
        ac_text = "冷房中"
        ac_color = "#3498db"
    
    label_style = "color: white; opacity: 0.9;" if analysis else "color: #7f8c8d;"

    # Outdoor Data
    out_temp = data.get('outdoor_temperature', '--')
    out_humid = data.get('outdoor_humidity', '--')
    
    status_msg = "快適"
    status_icon = "🙂"
    status_color = "#f1c40f" # Default yellow

    # Discomfort Index (DI) approximation or simple logic
    # DI = 0.81T + 0.01H(0.99T - 14.3) + 46.3
    di = 0.81 * temp + 0.01 * humid * (0.99 * temp - 14.3) + 46.3
    
    if di < 55:
        status_msg = "寒い"
        status_icon = "🥶"
        status_color = "#3498db"
    elif 55 <= di < 60:
        status_msg = "肌寒い"
        status_icon = "🧣"
        status_color = "#3498db"
    elif 60 <= di < 75:
        status_msg = "快適"
        status_icon = "🙂"
        status_color = "#2ecc71"
    elif 75 <= di < 80:
        status_msg = "やや暑い"
        status_icon = "😓"
        status_color = "#f1c40f"
    else:
        status_msg = "暑い"
        status_icon = "🥵"
        status_color = "#e74c3c"

    # Hero Section
    # Markdown Code Block回避のため、インデントを意図的に削除しています
    st.markdown(f"""
<div class="hero-container">
<div style="display: flex; justify-content: center; margin-bottom: 10px;">
<div style="text-align: center;">
<div style="font-size: 0.8rem; {label_style}">エアコン稼働状況</div>
<div style="color: {ac_color}; font-weight: bold; font-size: 1.2rem;">{ac_text}</div>
</div>
</div>
<div class="hero-values">
<div class="value-group">
<div class="value-label">温度</div>
<div><span class="value-number">{temp}</span><span class="value-unit">°C</span></div>
<div style="font-size: 0.8rem; opacity: 0.8; margin-top: 5px;">屋外: {out_temp}°C</div>
</div>
<div class="hero-divider"></div>
<div class="value-group">
<div class="value-label">湿度</div>
<div><span class="value-number">{humid}</span><span class="value-unit">%</span></div>
<div style="font-size: 0.8rem; opacity: 0.8; margin-top: 5px;">屋外: {out_humid}%</div>
</div>
</div>
{warning_html}
</div>
""", unsafe_allow_html=True)

    # Status Card with Gauge
    fig_gauge = go.Figure(go.Indicator(
        mode = "gauge+number",
        value = di,
        domain = {'x': [0, 1], 'y': [0, 1]},
        number = {'suffix': "", 'font': {'size': 40, 'weight': 'bold'}},
        title = {'text': f"快適指数: {status_msg}", 'font': {'size': 20}},
        gauge = {
            'axis': {'range': [0, 100], 'tickwidth': 1, 'tickcolor': "gray"},
            'bar': {'color': status_color},
            'bgcolor': "rgba(0,0,0,0.05)",
            'borderwidth': 0,
            'steps': [
                {'range': [0, 55], 'color': 'rgba(52, 152, 219, 0.1)'},
                {'range': [55, 60], 'color': 'rgba(52, 152, 219, 0.2)'},
                {'range': [60, 75], 'color': 'rgba(46, 204, 113, 0.2)'},
                {'range': [75, 80], 'color': 'rgba(241, 196, 15, 0.2)'},
                {'range': [80, 100], 'color': 'rgba(231, 76, 60, 0.2)'}
            ],
            'threshold': {
                'line': {'color': status_color, 'width': 4},
                'thickness': 0.75,
                'value': di
            }
        }
    ))

    fig_gauge.update_layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font={'color': status_color, 'family': "Helvetica Neue"},
        height=280,
        margin=dict(l=30, r=30, t=50, b=20),
    )

    st.plotly_chart(fig_gauge, use_container_width=True, config={'displayModeBar': False})

    
    # Pressure sub-card
    st.markdown(f"""
    <div class="card-container" style="display: flex; justify-content: space-between; align-items: center; padding: 15px;">
        <span class="metric-label" style="margin:0;">気圧</span>
        <div>
            <span style="font-size: 1.5rem; font-weight: bold; color: #2ecc71;">{data.get('pressure', '--')}</span>
            <span class="sensor-unit">hPa</span>
        </div>
    </div>
    """, unsafe_allow_html=True)



# Removed render_latest as it is merged into render_header
def render_latest_placeholder():
    pass

def render_charts(history_data, analysis_data):
    if not history_data:
        return
    
    df = pd.DataFrame(history_data)
    if df.empty:
        return

    df['datetime'] = pd.to_datetime(df['datetime'])
    
    # Prepare text labels and marker sizes (every 4 hours)
    
    text_temp, text_humid, text_press = [], [], []
    text_out_temp, text_out_humid = [], []
    
    # Marker sizes and positions: show only when text is shown
    size_temp, size_humid, size_press, size_out = [], [], [], []
    pos_temp, pos_humid, pos_press = [], [], []
    pos_out_temp, pos_out_humid = [], []
    for index, row in df.iterrows():
        dt = row['datetime']
        it = row['temperature']
        ih = row['humidity']
        ot = row.get('outdoor_temperature')
        oh = row.get('outdoor_humidity')

        if dt.minute == 0 and dt.hour % 4 == 0:
            text_temp.append(f"{it}°C<br>")
            text_humid.append(f"{ih}%<br>")
            text_press.append(f"{int(row['pressure'])}hPa<br>")
            text_out_temp.append(f"{ot}°C" if ot is not None else "")
            text_out_humid.append(f"{oh}%" if oh is not None else "")
            
            # Dynamic positioning to avoid overlap
            if ot is not None:
                pos_temp.append("top center" if it >= ot else "bottom center")
                pos_out_temp.append("bottom center" if it >= ot else "top center")
            else:
                pos_temp.append("top center")
                pos_out_temp.append("bottom center")

            if oh is not None:
                pos_humid.append("top center" if ih >= oh else "bottom center")
                pos_out_humid.append("bottom center" if ih >= oh else "top center")
            else:
                pos_humid.append("top center")
                pos_out_humid.append("bottom center")
                
            pos_press.append("top center")
            
            # Show markers
            size_temp.append(8)
            size_humid.append(8)
            size_press.append(8)
            size_out.append(6)
        else:
            text_temp.append("")
            text_humid.append("")
            text_press.append("")
            text_out_temp.append("")
            text_out_humid.append("")
            pos_temp.append("top center")
            pos_humid.append("top center")
            pos_press.append("top center")
            pos_out_temp.append("bottom center")
            pos_out_humid.append("bottom center")
            
            # Hide markers
            size_temp.append(0)
            size_humid.append(0)
            size_press.append(0)
            size_out.append(0)

    # Create 3 subplots sharing x-axis
    fig = make_subplots(
        rows=3, cols=1, 
        shared_xaxes=True, 
        vertical_spacing=0.1, 
        subplot_titles=("温度", "湿度", "気圧")
    )

    # Helper for layout
    def add_trace_with_style(fig, x, y, name, color, row, col, text_list, size_list, unit_range):
        pass # Not used, keeping manual for clarity

    # Temperature
    y_temp = df['temperature']
    min_t, max_t = min(y_temp), max(y_temp)
    
    # Range considering outdoor
    if 'outdoor_temperature' in df and df['outdoor_temperature'].notnull().any():
        out_t = df['outdoor_temperature'].dropna()
        min_t, max_t = min(min_t, min(out_t)), max(max_t, max(out_t))
    
    pad_t = (max_t - min_t) * 0.3 if max_t != min_t else 2
    
    # Outdoor Temp Trace (Dotted)
    if 'outdoor_temperature' in df:
        fig.add_trace(go.Scatter(
            x=df['datetime'], y=df['outdoor_temperature'],
            name="外気温",
            mode='lines+markers+text',
            text=text_out_temp,
            textposition=pos_out_temp,
            textfont=dict(color="rgba(127, 140, 141, 0.9)", size=10),
            line=dict(color="rgba(127, 140, 141, 0.6)", width=2, dash='dot', shape='spline'),
            marker=dict(size=size_out, color='rgba(127, 140, 141, 0.6)'),
            connectgaps=True,
        ), row=1, col=1)

    fig.add_trace(go.Scatter(
        x=df['datetime'], y=df['temperature'],
        name="温度",
        mode='lines+markers+text',
        text=text_temp,
        textposition=pos_temp,
        textfont=dict(color="#2ecc71", size=11, weight='bold'),
        cliponaxis=False, 
        line=dict(color="#2ecc71", width=3, shape='spline'),
        marker=dict(size=size_temp, color='white', line=dict(width=2, color="#2ecc71")),
    ), row=1, col=1)

    # Humidity
    y_hum = df['humidity']
    min_h, max_h = min(y_hum), max(y_hum)

    if 'outdoor_humidity' in df and df['outdoor_humidity'].notnull().any():
        out_h = df['outdoor_humidity'].dropna()
        min_h, max_h = min(min_h, min(out_h)), max(max_h, max(out_h))
        
    pad_h = (max_h - min_h) * 0.3 if max_h != min_h else 5

    # Outdoor Humid Trace (Dotted)
    if 'outdoor_humidity' in df:
        fig.add_trace(go.Scatter(
            x=df['datetime'], y=df['outdoor_humidity'],
            name="外湿度",
            mode='lines+markers+text',
            text=text_out_humid,
            textposition=pos_out_humid,
            textfont=dict(color="rgba(127, 140, 141, 0.9)", size=10),
            line=dict(color="rgba(127, 140, 141, 0.5)", width=2, dash='dot', shape='spline'),
            marker=dict(size=size_out, color='rgba(127, 140, 141, 0.5)'),
            connectgaps=True,
        ), row=2, col=1)

    fig.add_trace(go.Scatter(
        x=df['datetime'], y=df['humidity'],
        name="湿度",
        mode='lines+markers+text',
        text=text_humid,
        textposition=pos_humid,
        textfont=dict(color="#3498db", size=11, weight='bold'),
        cliponaxis=False,
        line=dict(color="#3498db", width=3, shape='spline'),
        marker=dict(size=size_humid, color='white', line=dict(width=2, color="#3498db")),
    ), row=2, col=1)
    
    # Pressure
    y_press = df['pressure']
    min_p, max_p = min(y_press), max(y_press)
    pad_p = (max_p - min_p) * 0.4 if max_p != min_p else 2

    fig.add_trace(go.Scatter(
        x=df['datetime'], y=df['pressure'],
        name="気圧",
        mode='lines+markers+text',
        text=text_press,
        textposition=pos_press,
        textfont=dict(color="#9b59b6", size=11, weight='bold'),
        cliponaxis=False,
        line=dict(color="#9b59b6", width=3, shape='spline'),
        marker=dict(size=size_press, color='white', line=dict(width=2, color="#9b59b6")),
    ), row=3, col=1)

    # Add Analysis Overlays (AC and Occupancy)
    if analysis_data and 'history' in analysis_data:
        analysis_df = pd.DataFrame(analysis_data['history'])
        analysis_df['datetime'] = pd.to_datetime(analysis_df['datetime'])
        
        # AC Highlight on Temperature (row 1)
        for i in range(len(analysis_df) - 1):
            mode = analysis_df.iloc[i]['ac_mode']
            if mode != "OFF":
                color = "rgba(231, 76, 60, 0.15)" if mode == "HEATING" else "rgba(52, 152, 219, 0.15)"
                fig.add_vrect(
                    x0=analysis_df.iloc[i]['datetime'], 
                    x1=analysis_df.iloc[i+1]['datetime'],
                    fillcolor=color, opacity=0.5, layer="below", line_width=0,
                    row=1, col=1
                )

    fig.update_layout(
        template="plotly_white",
        font=dict(family="Helvetica", size=11, color="#7f8c8d"),
        height=800, # Increased height again for spacing
        showlegend=False,
        margin=dict(l=20, r=20, t=30, b=20),
        hovermode="x unified"
    )
    
    # Calculate manual ticks: Date once at the start, then only time
    # Interval: 4 hours
    if not df.empty:
        start_dt = df['datetime'].min().replace(minute=0, second=0, microsecond=0)
        end_dt = df['datetime'].max()
        # Generate ticks every 4 hours
        tick_vals = pd.date_range(start=start_dt, end=end_dt, freq='4h')
        
        tick_text = []
        last_date = None
        for i, t in enumerate(tick_vals):
            curr_date = t.date()
            if i == 0 or curr_date != last_date:
                tick_text.append(t.strftime("%y/%m/%d<br>%H:%M"))
            else:
                tick_text.append(t.strftime("<br>%H:%M"))
            last_date = curr_date
                
        fig.update_xaxes(
            showgrid=False, 
            showline=False, 
            linecolor="#bdc3c7", 
            fixedrange=True,
            tickmode='array',
            tickvals=tick_vals,
            ticktext=tick_text
        )
    
    # Explicitly set ranges to avoid 0 inclusion and provide headroom for text
    # Increase padding to ensure labels aren't cut off
    pad_t_extra = (max_t - min_t) * 0.4
    pad_h_extra = (max_h - min_h) * 0.4
    
    fig.update_yaxes(showgrid=False, showticklabels=False, zeroline=False, fixedrange=True, range=[min_t - pad_t_extra, max_t + pad_t_extra], row=1, col=1)
    fig.update_yaxes(showgrid=False, showticklabels=False, zeroline=False, fixedrange=True, range=[min_h - pad_h_extra, max_h + pad_h_extra], row=2, col=1)
    fig.update_yaxes(showgrid=False, showticklabels=False, zeroline=False, fixedrange=True, range=[min_p - pad_p, max_p + pad_p], row=3, col=1)


    # Hide modebar with config
    st.plotly_chart(fig, use_container_width=True, config={'displayModeBar': False})

def render_daily(daily_data):
    if not daily_data:
        return

    st.markdown("<h3 style='color: #2c3e50; border-left: 5px solid #2ecc71; padding-left: 10px;'>📅 日次サマリー</h3>", unsafe_allow_html=True)
    
    # Just show the last available day (usually Today) and maybe a table for history
    if len(daily_data) > 0:
        latest_day = daily_data[-1] # Assuming sorted
        
        # Today's Data
        st.markdown(f"""
        <div class="daily-summary-container">
            <div class="daily-card">
                <div class="metric-label">今日の最高気温<br><span style="font-size: 0.8em">({latest_day.get('temp_max_time', '')} 観測)</span></div>
                <div class="metric-value" style="color: #e74c3c;">{latest_day['temp_max']} °C</div>
            </div>
            <div class="daily-card">
                <div class="metric-label">今日の最低気温<br><span style="font-size: 0.8em">({latest_day.get('temp_min_time', '')} 観測)</span></div>
                <div class="metric-value" style="color: #3498db;">{latest_day['temp_min']} °C</div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        # Yesterday's Data (if available)
        if len(daily_data) >= 2:
            yesterday = daily_data[-2]
            st.markdown(f"""
            <div class="daily-summary-container" style="margin-top: 15px;">
                <div class="yesterday-card">
                    <div class="metric-label">昨日の最高気温<br><span style="font-size: 0.8em">({yesterday.get('temp_max_time', '')} 観測)</span></div>
                    <div class="metric-value" style="color: #e74c3c; opacity: 0.8;">{yesterday['temp_max']} °C</div>
                </div>
                <div class="yesterday-card">
                    <div class="metric-label">昨日の最低気温<br><span style="font-size: 0.8em">({yesterday.get('temp_min_time', '')} 観測)</span></div>
                    <div class="metric-value" style="color: #3498db; opacity: 0.8;">{yesterday['temp_min']} °C</div>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
    # Spacer
    st.markdown("<div style='margin-bottom: 30px;'></div>", unsafe_allow_html=True)

    # Table
    with st.expander("過去のデータを見る"):
        df_daily = pd.DataFrame(daily_data)
        
        # Rename columns for clarity before creating MultiIndex
        # Expected from backend: date, temp_max, temp_min, humid_max, humid_min, pressure_max, pressure_min
        # We need to map these to the structure User wants.
        
        if not df_daily.empty:
            # Create a new structure
            table_data = []
            for _, row in df_daily.iterrows():
                table_data.append({
                    ("日付", ""): row['date'],
                    ("気温", "最高"): f"{row['temp_max']} °C",
                    ("気温", "最低"): f"{row['temp_min']} °C",
                    ("湿度", "最高"): f"{row['humid_max']} %",
                    ("湿度", "最低"): f"{row['humid_min']} %",
                    ("気圧", "最高"): f"{row['pressure_max']} hPa" if row.get('pressure_max') else "-",
                    ("気圧", "最低"): f"{row['pressure_min']} hPa" if row.get('pressure_min') else "-",
                })
            
            df_display = pd.DataFrame(table_data)
            
            # Set the MultiIndex by creating it directly from keys or reconstructing
            # Actually, passing dict with tuple keys to DataFrame defaults to MultiIndex columns if done right?
            # No, usually it flattens or needs explicit index.
            # Better approach: Create Flat DF then set columns.
            
            flat_data = []
            for _, row in df_daily.iterrows():
                # Format date as YY/MM/DD
                try:
                    d = pd.to_datetime(row['date'])
                    disp_date = d.strftime("%y/%m/%d")
                except:
                    disp_date = row['date']
                    
                flat_data.append([
                    disp_date,
                    row['temp_max'], row['temp_min'],
                    row['humid_max'], row['humid_min'],
                    row.get('pressure_max'), row.get('pressure_min')
                ])
            
            # Define MultiIndex Columns
            columns = pd.MultiIndex.from_tuples([
                ("日付", ""),
                ("気温", "最高"), ("気温", "最低"),
                ("湿度", "最高"), ("湿度", "最低"),
                ("気圧", "最高"), ("気圧", "最低")
            ])
            
            df_display = pd.DataFrame(flat_data, columns=columns)
            
            st.dataframe(df_display, width='stretch', hide_index=True)
        else:
            st.info("データがありません")

# --- Main Application Loop ---
def main():
    st.set_page_config(
        page_title="MyRoom",
        page_icon="🌡️",
        layout="centered", # Mobile friendly
        initial_sidebar_state="collapsed"
    )

    try:
        local_css("frontend/style.css")
    except FileNotFoundError:
        st.error("CSS file not found. Please ensure frontend/style.css exists.")

    # 1. Check Password
    if not check_password():
        st.stop()

    # 2. Main Content
    # Sidebar for logout (just clearing session)
    with st.sidebar:
        if st.button("ログアウト"):
            del st.session_state["password_correct"]
            st.rerun()

    # Device Selection (Optional, defaulting to 1)
    # device_id = st.sidebar.number_input("デバイスID", min_value=1, value=1, step=1)
    device_id = 1 

    # 3. Latest Data (Hero + Status)
    latest = get_latest(device=device_id)
    render_header_card(latest, get_analysis_data(device=device_id)) 

    st.divider()
    
    # 4. 24h History with Date Selection
    st.markdown("<h3 style='color: #2c3e50; border-left: 5px solid #2ecc71; padding-left: 10px;'>📈 24時間推移</h3>", unsafe_allow_html=True)
    
    # Use JST for now
    now_jst = pd.Timestamp.now(tz='Asia/Tokyo')
    
    # Selection of display mode
    view_mode = st.radio("表示モード", ["直近", "今日", "昨日", "特定日"], horizontal=True, label_visibility="collapsed")
    
    if view_mode == "直近":
        date_str = None
    elif view_mode == "今日":
        date_str = now_jst.strftime("%Y-%m-%d")
    elif view_mode == "昨日":
        date_str = (now_jst - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        selected_date = st.date_input("表示日の選択", value=now_jst.date(), label_visibility="collapsed")
        date_str = selected_date.strftime("%Y-%m-%d")

    analysis = get_analysis_data(date_str, device=device_id)
    history = get_history(date_str, device=device_id)
    render_charts(history, analysis)
    
    # 5. Daily Stats
    daily = get_daily_stats(device=device_id)
    render_daily(daily)
    
    # Simple Auto-refresh button or info
    if st.button("更新"):
        st.rerun()

if __name__ == "__main__":
    main()
