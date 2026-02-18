module.exports = {
    apps: [{
        name: "insight-backend",
        script: "./venv/bin/uvicorn",
        args: "backend.main:app --host 127.0.0.1 --port 8000 --root-path /insight-myroom/api",
        interpreter: "none",
        cwd: "./",
        watch: false,
        env: {
            NODE_ENV: "production",
        }
    }]
}
