#!/bin/bash
# Audiogravity UI — Dev Environment Manager
# Manages: Vite frontend (port 3000)
# Requires: audiogravity.core backend running on port 8000

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VITE_PID_FILE="$SCRIPT_DIR/vite.pid"
VITE_LOG_FILE="$SCRIPT_DIR/vite.log"
BACKEND_PORT="${BACKEND_PORT:-8001}"
VITE_HTTPS=false

DEV_HOST="${AG_DEV_HOST:-$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[0-9.]+' || echo localhost)}"
VITE_URL="http://${DEV_HOST}:3000"

for arg in "$@"; do
    case "$arg" in
        --https) VITE_HTTPS=true; VITE_URL="https://${DEV_HOST}:3000" ;;
    esac
done

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${BLUE}→${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

# ── Vite helpers ──────────────────────────────────────────────────────────────

_vite_pid()     { [ -f "$VITE_PID_FILE" ] && cat "$VITE_PID_FILE" || echo ""; }
_vite_running() { local pid=$(_vite_pid); [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; }

_vite_start() {
    if _vite_running; then warn "Vite already running (PID: $(_vite_pid))"; return; fi
    [ -f "$VITE_PID_FILE" ] && rm "$VITE_PID_FILE"
    info "Starting Vite → ${VITE_URL} (proxy → :${BACKEND_PORT})"
    cd "$SCRIPT_DIR"
    # setsid creates a new process group — allows killing the full tree (npm + node/vite) with kill -- -PGID
    setsid bash -c "BACKEND_PORT=$BACKEND_PORT VITE_HTTPS=$VITE_HTTPS exec npm run dev" > "$VITE_LOG_FILE" 2>&1 &
    echo $! > "$VITE_PID_FILE"
    ok "Vite started (PID: $(cat $VITE_PID_FILE))"
}

_vite_stop() {
    local pid=$(_vite_pid)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        # Kill the entire process group (setsid makes the PID the group leader)
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        rm -f "$VITE_PID_FILE"; ok "Vite stopped"
    else
        local stray; stray=$(pgrep -f "node.*vite" | grep -v "$$" || true)
        if [ -n "$stray" ]; then
            kill $stray 2>/dev/null || true; rm -f "$VITE_PID_FILE"; ok "Vite stopped (stray PID)"
        else
            warn "Vite was not running"
        fi
    fi
}

_vite_status() {
    if _vite_running; then ok "Frontend   PID=$(_vite_pid)  ${VITE_URL}"
    else fail "Frontend   not running"; fi
}

# ── Commands ──────────────────────────────────────────────────────────────────

cmd_start() {
    echo ""
    case "${2:-all}" in
        frontend|vite|all|*) echo -e "${BLUE}Starting frontend…${NC}"; echo ""; _vite_start ;;
    esac
    echo ""
}

cmd_stop() {
    echo ""
    case "${2:-all}" in
        frontend|vite|all|*) echo -e "${BLUE}Stopping frontend…${NC}"; echo ""; _vite_stop ;;
    esac
    echo ""
}

cmd_restart() { cmd_stop "$@"; sleep 1; cmd_start "$@"; }

cmd_status() {
    echo ""
    echo -e "${BLUE}Audiogravity UI — dev status:${NC}"
    echo ""
    _vite_status
    echo ""
}

cmd_logs() {
    case "${2:-frontend}" in
        frontend|vite|all|*) tail -f "$VITE_LOG_FILE" ;;
    esac
}

cmd_test() {
    shift
    REPORT=false; REPORT_DIR="/tmp/ag-test-report"; rest_args=()
    for a in "$@"; do
        if [ "$a" = "--report" ]; then REPORT=true; else rest_args+=("$a"); fi
    done
    set -- "${rest_args[@]}"

    _vitest_report_args() {
        [ "$REPORT" = true ] && echo "--reporter=default --reporter=junit --outputFile=$REPORT_DIR/ag-test-frontend.xml" || true
    }

    target="${1:-frontend}"
    case "$target" in
        frontend|front|all|*)
            [ "${1:-}" = "frontend" ] || [ "${1:-}" = "front" ] || [ "${1:-}" = "all" ] && shift || true
            cd "$SCRIPT_DIR" && npx vitest run --project unit "$@" $(_vitest_report_args)
            ;;
    esac
    rc=$?
    [ "$REPORT" = true ] && mkdir -p "$REPORT_DIR"
    [ $rc -eq 0 ]
}

cmd_help() {
    echo ""
    echo -e "${BLUE}Audiogravity UI — Dev Environment Manager${NC}"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start                  Start Vite dev server"
    echo "  start frontend         Start Vite only"
    echo "  stop                   Stop Vite dev server"
    echo "  stop frontend          Stop Vite only"
    echo "  restart                Restart Vite dev server"
    echo "  restart frontend       Restart Vite only"
    echo "  status                 Show running state"
    echo "  logs                   Tail Vite log"
    echo "  logs frontend          Tail Vite log"
    echo "  test                   Run frontend unit tests"
    echo "  test frontend          Run frontend unit tests only"
    echo "  test --report          Run tests and generate JUnit XML"
    echo "  storybook              Launch Storybook on :6006"
    echo "  help, -h, --help       Show this help"
    echo ""
    echo "Services:"
    echo "  Frontend   ${VITE_URL}    Vite dev server (HMR, use --https for TLS)"
    echo ""
    echo "Notes:"
    echo "  • Requires audiogravity.core backend running on port ${BACKEND_PORT}"
    echo "  • Override backend port: BACKEND_PORT=8001 ./dev.sh start"
    echo "  • Frontend updates instantly in the browser via HMR"
    echo ""
}

# ── Entry point ───────────────────────────────────────────────────────────────

case "${1:-}" in
    start)           cmd_start "$@" ;;
    stop)            cmd_stop "$@" ;;
    restart)         cmd_restart "$@" ;;
    status)          cmd_status ;;
    logs)            cmd_logs "$@" ;;
    test)            cmd_test "$@" ;;
    storybook)       cd "$SCRIPT_DIR" && npm run storybook ;;
    help|-h|--help|"") cmd_help ;;
    *)
        echo ""
        echo -e "${RED}Unknown command: $1${NC}"
        cmd_help
        exit 1
        ;;
esac
