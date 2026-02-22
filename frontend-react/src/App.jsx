import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Container, Box, Typography, Button, TextField, IconButton,
    Tabs, Tab, Fade, CircularProgress, Alert
} from '@mui/material';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Brush
} from 'recharts';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpacityIcon from '@mui/icons-material/Opacity';
import CompressIcon from '@mui/icons-material/Compress';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';

// Theme setup
import { createTheme, ThemeProvider } from '@mui/material/styles';
const theme = createTheme({
    palette: {
        mode: 'light',
        primary: { main: '#2ecc71' },
    },
    typography: {
        fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: { borderRadius: 12, textTransform: 'none', fontWeight: 600 }
            }
        },
        MuiTextField: {
            styleOverrides: {
                root: { '& .MuiOutlinedInput-root': { borderRadius: 12 } }
            }
        }
    }
});

// Mock data generator for fallback
const getMockHistory = () => {
    const data = [];
    let now = new Date();
    for (let i = 0; i < 24; i++) {
        data.push({
            datetimeObj: new Date(now.getTime() - (23 - i) * 3600 * 1000).getTime(),
            temperature: 20 + Math.random() * 5,
            humidity: 40 + Math.random() * 20,
            pressure: 1013 + Math.random() * 10,
            outdoor_temperature: 15 + Math.random() * 5,
            outdoor_humidity: 50 + Math.random() * 10
        });
    }
    return data;
};

// Error Boundary
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <Box p={3} textAlign="center">
                    <Typography variant="h6" gutterBottom>Display Error</Typography>
                    <Button onClick={() => this.setState({ hasError: false })} variant="contained">Recover</Button>
                </Box>
            );
        }
        return this.props.children;
    }
}

function AppContent() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [latestData, setLatestData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [dailyStats, setDailyStats] = useState([]);
    const [analysisData, setAnalysisData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [chartTab, setChartTab] = useState(0);
    const [timeRange, setTimeRange] = useState('day');
    const [dailyLimit, setDailyLimit] = useState(7);

    // Check LocalStorage on mount
    useEffect(() => {
        const storedAuth = localStorage.getItem('app_auth');
        if (storedAuth === 'true') {
            setIsAuthenticated(true);
        }
    }, []);

    // Fetch data on auth change
    useEffect(() => {
        if (isAuthenticated) {
            fetchData();
            const interval = setInterval(fetchData, 30000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated, timeRange]);

    const handleLogin = () => {
        const envPassword = import.meta.env.VITE_APP_PASSWORD || 'admin';
        if (password === envPassword) {
            setIsAuthenticated(true);
            localStorage.setItem('app_auth', 'true');
            fetchData();
        } else {
            setError('パスワードを入力してください');
        }
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('app_auth');
    };

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            // Parallel requests for speed
            const [latestRes, historyRes, dailyRes, analysisRes] = await Promise.allSettled([
                axios.get('/api/latest'),
                axios.get(`/api/history?range=${timeRange}`),
                axios.get('/api/daily-stats'),
                axios.get('/api/analysis')
            ]);

            if (latestRes.status === 'fulfilled') setLatestData(latestRes.value.data || {});
            if (dailyRes.status === 'fulfilled') setDailyStats(dailyRes.value.data || []);
            if (analysisRes.status === 'fulfilled') setAnalysisData(analysisRes.value.data || {});

            if (historyRes.status === 'fulfilled') {
                const processed = (historyRes.value.data || []).map(item => ({
                    ...item,
                    displayTime: item.datetime ? new Date(item.datetime).getHours() + "時" : "",
                    datetimeObj: item.datetime ? new Date(item.datetime).getTime() : 0,
                    temperature: item.temperature || 0,
                    humidity: item.humidity || 0,
                    pressure: item.pressure ? Math.round(item.pressure) : 0,
                    // Ranges for aggregated view
                    temperatureRange: (item.temperature_min !== undefined && item.temperature_max !== undefined) ? [item.temperature_min, item.temperature_max] : null,
                    humidityRange: (item.humidity_min !== undefined && item.humidity_max !== undefined) ? [item.humidity_min, item.humidity_max] : null,
                    pressureRange: (item.pressure_min !== undefined && item.pressure_max !== undefined) ?
                        [Math.round(item.pressure_min), Math.round(item.pressure_max)] : null,
                }));
                setHistoryData(processed);
            }
        } catch (err) {
            console.error(err);
            setError('Connection failed. Using fallback data.');
        } finally {
            setLoading(false);
        }
    };

    const renderChart = () => {
        // Guard: ensure data exists
        if (!historyData || historyData.length === 0) {
            return <Box p={4} textAlign="center" color="text.secondary">データがありません</Box>;
        }

        let dataKey = "temperature";
        let rangeKey = "temperatureRange";
        let color = "#2ecc71";
        let outdoorKey = "outdoor_temperature";

        if (chartTab === 1) {
            dataKey = "humidity";
            rangeKey = "humidityRange";
            color = "#3498db";
            outdoorKey = "outdoor_humidity";
        } else if (chartTab === 2) {
            dataKey = "pressure";
            rangeKey = "pressureRange";
            color = "#9b59b6";
            outdoorKey = null;
        }



        return (
            <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                    key={`${chartTab}-${timeRange}`} /* Force re-render on tab/range change */
                    data={historyData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                    <defs>
                        <linearGradient id={`color-${chartTab}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis
                        dataKey="datetimeObj"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(t) => {
                            const date = new Date(t);
                            if (timeRange === 'day' || timeRange === 'week') return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                            if (timeRange === 'month') return `${date.getMonth() + 1}/${date.getDate()}`;
                            if (timeRange === 'year') return `${date.getFullYear().toString().slice(-2)}/${date.getMonth() + 1}/${date.getDate()}`;
                            return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                        }}
                        tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        tickCount={6}
                        scale="time"
                    />
                    <YAxis
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                    />
                    <Tooltip
                        labelFormatter={(t) => {
                            const date = new Date(t);
                            if (timeRange === 'day' || timeRange === 'week') return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                            if (timeRange === 'month') return `${date.getMonth() + 1}/${date.getDate()}`;
                            if (timeRange === 'year') return `${date.getFullYear().toString().slice(-2)}/${date.getMonth() + 1}/${date.getDate()}`;
                            return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        }}
                        formatter={(value, name) => {
                            const unit = chartTab === 0 ? '°C' : chartTab === 1 ? '%' : 'hPa';
                            let formattedValue;
                            if (typeof value === 'number') {
                                formattedValue = chartTab === 2 ? Math.round(value) : value.toFixed(1);
                            } else {
                                formattedValue = value;
                            }

                            if (Array.isArray(value)) {
                                const v0 = chartTab === 2 ? Math.round(value[0]) : value[0].toFixed(1);
                                const v1 = chartTab === 2 ? Math.round(value[1]) : value[1].toFixed(1);
                                return [`${v0}${unit} ~ ${v1}${unit}`, "範囲"];
                            }
                            const displayName = name === "outdoor_temperature" || name === "outdoor_humidity" ? "屋外" :
                                name === "temperature" || name === "humidity" || name === "pressure" ? "現在" : name;
                            return [`${formattedValue}${unit}`, displayName];
                        }}
                        contentStyle={{ backgroundColor: '#2d3436', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}
                        itemStyle={{ color: '#dfe6e9' }}
                        labelStyle={{ color: '#b2bec3', marginBottom: 4 }}
                        isAnimationActive={false} /* Disable animation to prevent crash on rapid updates/missing props */
                    />
                    {outdoorKey && (
                        <Line
                            type="monotone"
                            dataKey={outdoorKey}
                            stroke="#adb5bd"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                            name="屋外"
                            isAnimationActive={false}
                        />
                    )}

                    {/* Range Area (Min-Max) */}
                    <Area
                        type="monotone"
                        dataKey={rangeKey}
                        stroke="none"
                        fill={color}
                        fillOpacity={0.2}
                        isAnimationActive={false}
                        connectNulls
                        name="範囲"
                    />

                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        strokeWidth={3}
                        fillOpacity={1}
                        fill={`url(#color-${chartTab})`}
                        name="現在"
                        isAnimationActive={false}
                    />

                </AreaChart>
            </ResponsiveContainer>
        );
    };

    // Auth Screen
    if (!isAuthenticated) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 3, backgroundColor: 'var(--bg-color)' }}>
                <Typography variant="h4" fontWeight="700" gutterBottom>MyRoom</Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 4 }}>お部屋の状態をモニタリング</Typography>
                <Box sx={{ width: '100%', maxWidth: 300 }}>
                    <TextField
                        type="password"
                        fullWidth
                        variant="filled"
                        label="パスワード"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        InputProps={{ disableUnderline: true, style: { borderRadius: 16, backgroundColor: 'var(--card-bg)' } }}
                        sx={{ mb: 2 }}
                    />
                    {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 4 }}>{error}</Alert>}
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleLogin}
                        size="large"
                        disableElevation
                        sx={{ height: 50, fontSize: '1rem', background: '#2ecc71', '&:hover': { background: '#27ae60' } }}
                    >
                        ログイン
                    </Button>
                </Box>
            </Box>
        );
    }

    // Helper Variables
    const temp = latestData?.temperature != null ? latestData.temperature.toFixed(1) : '--';
    const humid = latestData?.humidity != null ? latestData.humidity : '--';
    const press = latestData?.pressure != null ? Math.round(latestData.pressure) : '--';
    const outTemp = latestData?.outdoor_temperature != null ? latestData.outdoor_temperature.toFixed(1) : '--';
    const lastUpdated = latestData?.datetime
        ? new Date(latestData.datetime).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '--';

    const acMode = analysisData?.ac_status || "OFF";
    const acText = acMode === "HEATING" ? "暖房 ON" : acMode === "COOLING" ? "冷房 ON" : "AC OFF";
    const acColor = acMode === "HEATING" ? "#ff6b6b" : acMode === "COOLING" ? "#4dabf7" : "#868e96";
    const acIcon = acMode === "HEATING" ? <WbSunnyIcon sx={{ fontSize: 16 }} /> : acMode === "COOLING" ? <AcUnitIcon sx={{ fontSize: 16 }} /> : <PowerSettingsNewIcon sx={{ fontSize: 16 }} />;

    return (
        <ThemeProvider theme={theme}>
            <Box sx={{ paddingBottom: 4 }}>
                <div className="hero-weather">
                    {acMode !== "OFF" && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 1 }}>
                            <Box sx={{
                                display: 'flex', alignItems: 'center', gap: 1,
                                padding: '4px 12px', borderRadius: 20,
                                backgroundColor: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(4px)',
                                border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer'
                            }} onClick={fetchData}>
                                <span style={{ color: acColor, display: 'flex', alignItems: 'center' }}>{acIcon}</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{acText}</span>
                            </Box>
                        </Box>
                    )}

                    <div className="current-temp-container">
                        <span className="current-temp">{temp}</span>
                        <span className="current-unit">°C</span>
                    </div>



                    <Box sx={{ mt: 1, opacity: 0.6 }}>
                        <Typography variant="caption">
                            最終更新: {lastUpdated}
                        </Typography>
                    </Box>
                </div>



                <Container maxWidth="xs" sx={{ padding: '0 20px' }}>
                    <div className="metrics-grid">
                        <div className="mini-card">
                            <div className="mini-label">湿度</div>
                            <div className="mini-value" style={{ color: '#3498db' }}>{humid}<span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>%</span></div>
                        </div>
                        <div className="mini-card">
                            <div className="mini-label">外気温</div>
                            <div className="mini-value">{outTemp}<span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>°C</span></div>
                        </div>
                        <div className="mini-card">
                            <div className="mini-label">気圧</div>
                            <div className="mini-value" style={{ color: '#9b59b6' }}>{press}<span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>hPa</span></div>
                        </div>
                        <div className="mini-card">
                            <div className="mini-label">快適度</div>
                            <div className="mini-value" style={{ fontSize: '1rem' }}>
                                {(() => {
                                    if (latestData?.temperature == null) return '--';
                                    const di = 0.81 * latestData.temperature + 0.01 * latestData.humidity * (0.99 * latestData.temperature - 14.3) + 46.3;
                                    if (di < 60) return "寒い 🥶";
                                    if (di < 75) return "快適 🙂";
                                    return "暑い 🥵";
                                })()}
                            </div>
                        </div>
                    </div>

                    <div className="chart-container">
                        <div className="chart-header">
                            <Tabs
                                value={chartTab}
                                onChange={(e, v) => setChartTab(v)}
                                variant="fullWidth"
                                sx={{ width: '100%', minHeight: 40 }}
                                TabIndicatorProps={{ style: { backgroundColor: chartTab === 0 ? '#2ecc71' : chartTab === 1 ? '#3498db' : '#9b59b6', borderRadius: 2 } }}
                            >
                                <Tab icon={<ThermostatIcon fontSize="small" />} label="温度" sx={{ minHeight: 40, padding: 0, color: chartTab === 0 ? '#2ecc71' : 'inherit', '&.Mui-selected': { color: '#2ecc71' } }} />
                                <Tab icon={<OpacityIcon fontSize="small" />} label="湿度" sx={{ minHeight: 40, padding: 0, color: chartTab === 1 ? '#3498db' : 'inherit', '&.Mui-selected': { color: '#3498db' } }} />
                                <Tab icon={<CompressIcon fontSize="small" />} label="気圧" sx={{ minHeight: 40, padding: 0, color: chartTab === 2 ? '#9b59b6' : 'inherit', '&.Mui-selected': { color: '#9b59b6' } }} />
                            </Tabs>
                        </div>

                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2 }}>
                            {['day', 'week', 'month', 'year'].map((range) => (
                                <Button
                                    key={range}
                                    size="small"
                                    onClick={() => setTimeRange(range)}
                                    sx={{
                                        minWidth: 40,
                                        borderRadius: 4,
                                        color: timeRange === range ? '#fff' : 'text.secondary',
                                        backgroundColor: timeRange === range ? (chartTab === 0 ? '#2ecc71' : chartTab === 1 ? '#3498db' : '#9b59b6') : 'transparent',
                                        '&:hover': {
                                            backgroundColor: timeRange === range ? (chartTab === 0 ? '#2ecc71' : chartTab === 1 ? '#3498db' : '#9b59b6') : 'rgba(0,0,0,0.05)'
                                        }
                                    }}
                                >
                                    {range === 'day' ? '1D' : range === 'week' ? '1W' : range === 'month' ? '1M' : '1Y'}
                                </Button>
                            ))}
                        </Box>



                        <div style={{ position: 'relative', minHeight: 220 }}>
                            {loading && (
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        bgcolor: 'rgba(0,0,0,0.5)',
                                        zIndex: 10,
                                        borderRadius: 2
                                    }}
                                >
                                    <CircularProgress size={30} />
                                </Box>
                            )}
                            <ErrorBoundary>{renderChart()}</ErrorBoundary>
                        </div>
                    </div>

                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1 }}>
                        <span className="section-label">最近の記録</span>
                        <IconButton size="small" onClick={handleLogout} sx={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                            ログアウト
                        </IconButton>
                    </Box>

                    <div className="daily-list">
                        {(() => {
                            const lastFive = dailyStats && dailyStats.slice(-dailyLimit).reverse();
                            if (!lastFive) return null;

                            // Calculate global min/max to scale bars based on active tab
                            let allValues = [];
                            if (chartTab === 0) {
                                allValues = lastFive.flatMap(d => [d.temp_min, d.temp_max]);
                            } else if (chartTab === 1) {
                                allValues = lastFive.flatMap(d => [d.humid_min, d.humid_max]);
                            } else {
                                allValues = lastFive.flatMap(d => [d.pressure_min, d.pressure_max]);
                            }

                            const validValues = allValues.filter(v => v != null);
                            const gMin = validValues.length > 0 ? Math.min(...validValues) : 0;
                            const gMax = validValues.length > 0 ? Math.max(...validValues) : 100;
                            const gRange = gMax - gMin || 1;

                            return lastFive.map((day, index) => {
                                // Decide which values to show based on chartTab
                                let dayMin, dayMax, curTempVal, unit;
                                let barGradient = 'linear-gradient(90deg, #3498db 0%, #f1c40f 50%, #e74c3c 100%)';

                                if (chartTab === 0) { // Temperature
                                    dayMin = day.temp_min;
                                    dayMax = day.temp_max;
                                    curTempVal = latestData?.temperature;
                                    unit = '°';
                                } else if (chartTab === 1) { // Humidity
                                    dayMin = day.humid_min;
                                    dayMax = day.humid_max;
                                    curTempVal = latestData?.humidity;
                                    unit = '%';
                                    barGradient = 'linear-gradient(90deg, #a5d8ff 0%, #3498db 100%)';
                                } else { // Pressure
                                    dayMin = day.pressure_min;
                                    dayMax = day.pressure_max;
                                    curTempVal = latestData?.pressure;
                                    unit = '';
                                    barGradient = 'linear-gradient(90deg, #e0c3fc 0%, #9b59b6 100%)';
                                }

                                const left = (dayMin != null) ? ((dayMin - gMin) / gRange) * 100 : 0;
                                const width = (dayMin != null && dayMax != null) ? ((dayMax - dayMin) / gRange) * 100 : 0;
                                const isToday = index === 0;
                                const curPos = (isToday && curTempVal != null && gRange > 0) ? ((curTempVal - gMin) / gRange) * 100 : null;

                                return (
                                    <div className="daily-item" key={index}>
                                        <span className="daily-date">
                                            {isToday ? "今日" : index === 1 ? "昨日" : (String(day.date).substring(5).replace('-', '/') || '--')}
                                        </span>
                                        <div className="daily-values">
                                            <span className="temp-lo">
                                                {dayMin != null ? (chartTab === 2 ? Math.round(dayMin) : dayMin.toFixed(1)) : '-'}{unit}
                                            </span>
                                            <div className="range-bar-bg">
                                                <div
                                                    className="range-bar-fill"
                                                    style={{ left: `${left}%`, width: `${width}%`, background: barGradient }}
                                                ></div>
                                                {curPos !== null && (
                                                    <div
                                                        className="range-current-dot"
                                                        style={{ left: `${curPos}%` }}
                                                    ></div>
                                                )}
                                            </div>
                                            <span className="temp-hi">
                                                {dayMax != null ? (chartTab === 2 ? Math.round(dayMax) : dayMax.toFixed(1)) : '-'}{unit}
                                            </span>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                        {dailyStats && dailyStats.length > dailyLimit && (
                            <Button
                                fullWidth
                                onClick={() => setDailyLimit(prev => Math.min(prev + 7, dailyStats.length))}
                                sx={{ mt: 1, color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                            >
                                さらに表示する
                            </Button>
                        )}
                    </div>
                    <Box height={50} />
                </Container>
            </Box>
        </ThemeProvider>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <AppContent />
        </ErrorBoundary>
    );
}
