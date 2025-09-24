document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('flowchart-canvas');
    const ctx = canvas.getContext('2d');

    // --- 상수 ---
    const PRIMARY_COLOR = '#007bff';
    const ANCHOR_COLOR = '#a9a9a9';
    const ANCHOR_RADIUS = 4;
    const ANCHOR_HOVER_RADIUS = 7;
    const PALETTE_COLORS = [
        '#ffffff', '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf',
        '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#dee2e6'
    ];

    // --- 상태 관리 ---
    let nodes = [];
    let edges = [];
    let selectedItem = null;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let nodeIdCounter = 0;
    let edgeIdCounter = 0;

    // --- 연결선 상태 ---
    let isConnecting = false;
    let connectionStart = null;
    let connectionLine = null;
    let hoverAnchor = null;

    // --- DOM 요소 ---
    const formatContent = document.getElementById('format-content');
    const textEditor = document.getElementById('text-editor');
    const contextMenu = document.getElementById('context-menu');
    const colorPalette = document.getElementById('ctx-color-palette');

    function init() {
        createPromptModal();
        setupEventListeners();
        updateFormatPanel();
        draw();
    }

    // --- 프롬프트 모달 생성 ---
    function createPromptModal() {
        if (document.getElementById('prompt-modal')) return;
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'prompt-modal';
        modalOverlay.className = 'modal-overlay';
        modalOverlay.style.display = 'none';
        modalOverlay.innerHTML = `
            <div class="modal-content">
                <h3>생성된 프롬프트</h3>
                <textarea id="modal-textarea" readonly></textarea>
                <div class="modal-actions">
                    <button id="modal-copy-btn" class="btn">클립보드에 복사</button>
                    <button id="modal-close-btn" class="btn btn-clear">닫기</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        document.getElementById('modal-close-btn')
            .addEventListener('click', () => modalOverlay.style.display = 'none');
        document.getElementById('modal-copy-btn')
            .addEventListener('click', () => {
                const textarea = document.getElementById('modal-textarea');
                textarea.select();
                document.execCommand('copy');
            });
    }

    // --- 이벤트 리스너 설정 ---
    function setupEventListeners() {
        document.getElementById('add-start')
            .addEventListener('click', () => addNode('start', '시작', 150, 50));
        document.getElementById('add-end')
            .addEventListener('click', () => addNode('end', '종료', 150, 50));
        document.getElementById('add-process')
            .addEventListener('click', () => addNode('process', '처리', 150, 70));
        document.getElementById('add-decision')
            .addEventListener('click', () => addNode('decision', '조건', 160, 80));
        document.getElementById('add-data')
            .addEventListener('click', () => addNode('data', '데이터', 150, 70));

        const leftSidebar = document.getElementById('left-sidebar');
        const rightSidebar = document.getElementById('right-sidebar');
        const appContainer = document.querySelector('.app-container');
        document.getElementById('toggle-left-sidebar')
            .addEventListener('click', () => {
                leftSidebar.classList.toggle('collapsed');
                appContainer.classList.toggle('left-collapsed');
            });
        document.getElementById('toggle-right-sidebar')
            .addEventListener('click', () => {
                rightSidebar.classList.toggle('collapsed');
                appContainer.classList.toggle('right-collapsed');
            });

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('dblclick', handleDoubleClick);
        canvas.addEventListener('contextmenu', handleContextMenu);

        document.getElementById('ctx-delete')
            .addEventListener('click', () => {
                if (contextMenuItem) deleteItem(contextMenuItem);
                hideContextMenu();
            });
        window.addEventListener('click', () => hideContextMenu());

        textEditor.addEventListener('blur', hideTextEditor);
        textEditor.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                hideTextEditor();
            }
        });

        document.getElementById('clear-canvas').addEventListener('click', clearCanvas);
        document.getElementById('save-btn').addEventListener('click', saveState);
        const fileInput = document.getElementById('file-input');
        document.getElementById('load-btn').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', loadState);
        document.getElementById('generate-prompt').addEventListener('click', generatePrompt);
    }

    // --- 메인 캔버스 그리기 ---
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        edges.forEach(drawEdge);
        if (isConnecting && connectionLine) drawEdge(connectionLine);
        nodes.forEach(drawNode);
    }

    // --- 노드 그리기 ---
    function drawNode(node) {
        ctx.save();
        ctx.fillStyle = node.color;
        const isSelected = selectedItem?.type === 'node' && selectedItem.id === node.id;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? PRIMARY_COLOR : '#2c3e50';

        ctx.beginPath();
        switch (node.shape) {
            case 'start': case 'end':
                ctx.roundRect(node.x, node.y, node.width, node.height, 25); break;
            case 'process':
                ctx.rect(node.x, node.y, node.width, node.height); break;
            case 'decision':
                ctx.moveTo(node.x + node.width / 2, node.y);
                ctx.lineTo(node.x + node.width, node.y + node.height / 2);
                ctx.lineTo(node.x + node.width / 2, node.y + node.height);
                ctx.lineTo(node.x, node.y + node.height / 2);
                ctx.closePath();
                break;
            case 'data':
                ctx.moveTo(node.x + 20, node.y);
                ctx.lineTo(node.x + node.width, node.y);
                ctx.lineTo(node.x + node.width - 20, node.y + node.height);
                ctx.lineTo(node.x, node.y + node.height);
                ctx.closePath();
                break;
        }
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#212529';
        ctx.font = '16px Noto Sans KR';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = node.text.split('\n');
        const lineHeight = 20;
        const startY = node.y + node.height / 2 - (lineHeight * (lines.length - 1)) / 2;
        lines.forEach((line, i) =>
            ctx.fillText(line, node.x + node.width / 2, startY + i * lineHeight)
        );

        const points = getAttachmentPoints(node);
        Object.values(points).forEach(p => {
            const isHovered = hoverAnchor &&
                hoverAnchor.nodeId === node.id &&
                hoverAnchor.pos.x === p.x &&
                hoverAnchor.pos.y === p.y;
            ctx.fillStyle = isHovered ? PRIMARY_COLOR : ANCHOR_COLOR;
            ctx.beginPath();
            ctx.arc(p.x, p.y,
                isHovered ? ANCHOR_HOVER_RADIUS : ANCHOR_RADIUS, 0, 2 * Math.PI);
            ctx.fill();
        });
        ctx.restore();
    }

    // --- 간선(화살표) 그리기 ---
    function drawEdge(edge) {
        if (!edge.path || edge.path.length < 2) return;
        ctx.save();

        const isSelected = selectedItem?.type === 'edge' && selectedItem.id === edge.id;
        const strokeColor = isSelected ? PRIMARY_COLOR : '#34495e';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isSelected ? 3 : 2;

        const path = edge.path;
        const p_end = path[path.length - 1];
        const p_before_end = path[path.length - 2];

        const arrowLength = 12;
        const arrowAngle = Math.PI / 6;

        const angle = Math.atan2(
            p_end.y - p_before_end.y,
            p_end.x - p_before_end.x
        );

        const lineEnd = {
            x: p_end.x - arrowLength * Math.cos(angle),
            y: p_end.y - arrowLength * Math.sin(angle)
        };

        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length - 1; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.lineTo(lineEnd.x, lineEnd.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p_end.x, p_end.y);
        ctx.lineTo(
            lineEnd.x - arrowLength * Math.cos(angle - arrowAngle),
            lineEnd.y - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.lineTo(
            lineEnd.x - arrowLength * Math.cos(angle + arrowAngle),
            lineEnd.y - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.closePath();
        ctx.fillStyle = strokeColor;
        ctx.fill();

// --- 라벨 ---
if (edge.text && edge.path.length > 1) {
    ctx.font = '14px Noto Sans KR';
    const textWidth = ctx.measureText(edge.text).width;

    // 전체 path의 수평/수직 길이 합산
    let totalH = 0, totalV = 0;
    for (let i = 0; i < edge.path.length - 1; i++) {
        const dx = edge.path[i+1].x - edge.path[i].x;
        const dy = edge.path[i+1].y - edge.path[i].y;
        totalH += Math.abs(dx);
        totalV += Math.abs(dy);
    }

    // 기준 방향 선택
    const preferHorizontal = totalH >= totalV;

    // 기준 방향에 맞는 가장 긴 세그먼트 찾기
    let targetSeg = null;
    let maxLen = -1;
    for (let i = 0; i < edge.path.length - 1; i++) {
        const dx = edge.path[i+1].x - edge.path[i].x;
        const dy = edge.path[i+1].y - edge.path[i].y;
        if (preferHorizontal && Math.abs(dx) > maxLen) {
            maxLen = Math.abs(dx);
            targetSeg = [edge.path[i], edge.path[i+1]];
        } else if (!preferHorizontal && Math.abs(dy) > maxLen) {
            maxLen = Math.abs(dy);
            targetSeg = [edge.path[i], edge.path[i+1]];
        }
    }

    // 라벨 위치 = 선택된 세그먼트의 중앙
    const labelX = (targetSeg[0].x + targetSeg[1].x) / 2;
    const labelY = (targetSeg[0].y + targetSeg[1].y) / 2;

    // 배경 박스
    ctx.fillStyle = 'white';
    ctx.fillRect(labelX - textWidth / 2 - 6, labelY - 12, textWidth + 12, 24);

    // 텍스트
    ctx.fillStyle = '#34495e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(edge.text, labelX, labelY);
}


    }

    // --- 노드 추가 ---
    function addNode(shape, text, width, height) {
        nodes.push({
            id: nodeIdCounter++,
            type: 'node',
            x: 50, y: 50,
            width, height,
            color: '#ffffff',
            text, shape
        });
        draw();
    }

    // --- 간선 추가 ---
    function addEdge(fromNodeId, fromAnchor, toNodeId, toAnchor) {
        const edge = {
            id: edgeIdCounter++,
            type: 'edge',
            from: fromNodeId, fromAnchor,
            to: toNodeId, toAnchor,
            text: ''
        };
        edges.push(edge);
        calculateEdgePath(edge);
        draw();
    }

    // --- 노드/간선 삭제 ---
    function deleteItem(item) {
        if (!item) return;
        if (item.type === 'node') {
            nodes = nodes.filter(n => n.id !== item.id);
            edges = edges.filter(e => e.from !== item.id && e.to !== item.id);
        } else if (item.type === 'edge') {
            edges = edges.filter(e => e.id !== item.id);
        }
        calculateAllEdgePaths();
        selectedItem = null;
        updateFormatPanel();
        draw();
    }

    // --- 앵커 포인트 계산 ---
    function getAttachmentPoints(node) {
        const { x, y, width: w, height: h } = node;
        return {
            top: { x: x + w / 2, y: y },
            bottom: { x: x + w / 2, y: y + h },
            left: { x: x, y: y + h / 2 },
            right: { x: x + w, y: y + h / 2 }
        };
    }

    function calculateAllEdgePaths() { edges.forEach(calculateEdgePath); }

    // --- 경로 계산 (항상 올바른 방향으로) ---
    function calculateEdgePath(edge) {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode   = nodes.find(n => n.id === edge.to);
        if (!fromNode || !toNode) return;

        const fromPts = getAttachmentPoints(fromNode);
        const toPts   = getAttachmentPoints(toNode);
        const start   = fromPts[edge.fromAnchor];
        const end     = toPts[edge.toAnchor];

        const stub = 20;
        const path = [];

        let p1;
        switch (edge.fromAnchor) {
            case 'left':   p1 = { x: start.x - stub, y: start.y }; break;
            case 'right':  p1 = { x: start.x + stub, y: start.y }; break;
            case 'top':    p1 = { x: start.x, y: start.y - stub }; break;
            case 'bottom': p1 = { x: start.x, y: start.y + stub }; break;
        }
        path.push(start, p1);

        let approach;
        switch (edge.toAnchor) {
            case 'left':   approach = { x: end.x - stub, y: end.y }; break;
            case 'right':  approach = { x: end.x + stub, y: end.y }; break;
            case 'top':    approach = { x: end.x, y: end.y - stub }; break;
            case 'bottom': approach = { x: end.x, y: end.y + stub }; break;
        }

        path.push({ x: approach.x, y: p1.y });
        path.push(approach);
        path.push(end);

        edge.path = path;
    }

    // --- 마우스 이벤트 ---
    function handleMouseDown(e) {
        hideContextMenu();
        hideTextEditor();
        const pos = getMousePos(e);
        const anchor = getAnchorAtPos(pos.x, pos.y);

        if (isConnecting) {
            if (anchor && anchor.nodeId !== connectionStart.nodeId) {
                addEdge(connectionStart.nodeId, connectionStart.key, anchor.nodeId, anchor.key);
            }
            isConnecting = false;
            connectionStart = null;
            connectionLine = null;
            draw();
            return;
        }

        if (anchor) {
            isConnecting = true;
            connectionStart = anchor;
            connectionLine = { type: 'edge', path: [anchor.pos, pos] };
            draw();
            return;
        }

        selectedItem = getNodeAtPos(pos.x, pos.y) || getEdgeAtPos(pos.x, pos.y);
        if (selectedItem?.type === 'node') {
            isDragging = true;
            dragStart.x = pos.x - selectedItem.x;
            dragStart.y = pos.y - selectedItem.y;
        }
        updateFormatPanel();
        draw();
    }

    function handleMouseMove(e) {
        const pos = getMousePos(e);
        hoverAnchor = getAnchorAtPos(pos.x, pos.y);

        if (isConnecting) {
            connectionLine.path = [connectionStart.pos, pos];
        } else if (isDragging && selectedItem?.type === 'node') {
            selectedItem.x = pos.x - dragStart.x;
            selectedItem.y = pos.y - dragStart.y;
            calculateAllEdgePaths();
        }
        draw();
    }

    function handleMouseUp(e) { isDragging = false; }

    function handleDoubleClick(e) {
        const pos = getMousePos(e);
        const item = getNodeAtPos(pos.x, pos.y) || getEdgeAtPos(pos.x, pos.y);
        if (item) showTextEditor(item);
    }

    let contextMenuItem = null;
    function handleContextMenu(e) {
        e.preventDefault();
        const pos = getMousePos(e);
        contextMenuItem = getNodeAtPos(pos.x, pos.y) || getEdgeAtPos(pos.x, pos.y);
        if (contextMenuItem) {
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;
            contextMenu.style.display = 'block';
            const isNode = contextMenuItem.type === 'node';
            document.getElementById('ctx-change-color').style.display = isNode ? 'block' : 'none';
            colorPalette.style.display = isNode ? 'block' : 'none';
            if (isNode) {
                colorPalette.innerHTML = '';
                PALETTE_COLORS.forEach(color => {
                    const swatch = document.createElement('div');
                    swatch.className = 'color-swatch';
                    swatch.style.backgroundColor = color;
                    swatch.addEventListener('click', (event) => {
                        event.stopPropagation();
                        contextMenuItem.color = color;
                        draw();
                        hideContextMenu();
                    });
                    colorPalette.appendChild(swatch);
                });
            }
        }
    }

    function hideContextMenu() {
        if (contextMenu.style.display === 'block') contextMenu.style.display = 'none';
    }

    let editingItem = null;
    function showTextEditor(item) {
        editingItem = item;
        const canvasRect = canvas.getBoundingClientRect();
        let x, y, w, h;
        if (item.type === 'node') {
            ({ x, y, width: w, height: h } = item);
            x += canvasRect.left; 
            y += canvasRect.top;
        } else {
            if (!item.path || item.path.length < 2) return;
            const midIndex = Math.floor((item.path.length - 1) / 2);
            const p1 = item.path[midIndex], p2 = item.path[midIndex + 1] || p1;
            w = 80; h = 25;
            x = canvasRect.left + (p1.x + p2.x) / 2 - w / 2;
            y = canvasRect.top + (p1.y + p2.y) / 2 - h / 2;
        }
        Object.assign(textEditor.style, { 
            left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, display: 'block' 
        });
        textEditor.value = item.text;
        textEditor.focus(); 
        textEditor.select();
    }

    function hideTextEditor() {
    if (editingItem) {
        editingItem.text = textEditor.value;

        // --- [추가된 부분] 텍스트 길이에 맞춰 블록 크기 자동 조정 ---
        if (editingItem.type === 'node') {
            ctx.font = '16px Noto Sans KR';
            const lines = editingItem.text.split('\n');
            const lineHeight = 20;

            // 가장 긴 줄 기준 width 조정
            const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
            editingItem.width = Math.max(editingItem.width, maxWidth + 40);

            // 줄 개수에 맞춰 height 조정
            editingItem.height = Math.max(editingItem.height, lineHeight * lines.length + 20);
        }
    }

    textEditor.style.display = 'none';
    editingItem = null;
    draw();
    }


    function updateFormatPanel() {
        if (!selectedItem) { 
            formatContent.innerHTML = `<p class="placeholder-text">요소를 선택하여 편집하세요.</p>`; 
            return; 
        }
        if (selectedItem.type === 'node') {
            formatContent.innerHTML = `
              <div class="format-group">
                <h4>스타일</h4>
                <div class="format-row">
                  <label>채우기</label>
                  <input type="color" id="node-color-picker" value="${selectedItem.color}">
                </div>
              </div>`;
            document.getElementById('node-color-picker')
                .addEventListener('input', e => { selectedItem.color = e.target.value; draw(); });
        } else if (selectedItem.type === 'edge') {
            formatContent.innerHTML = `
              <div class="format-group">
                <h4>레이블</h4>
                <div class="format-row">
                  <label for="edge-label-input">텍스트</label>
                  <input type="text" id="edge-label-input" value="${selectedItem.text}">
                </div>
              </div>`;
            const input = document.getElementById('edge-label-input');
            input.focus();
            input.addEventListener('input', e => { selectedItem.text = e.target.value; draw(); });
        }
    }

    function getMousePos(e) { 
        const rect = canvas.getBoundingClientRect(); 
        return { x: e.clientX - rect.left, y: e.clientY - rect.top }; 
    }

    function getNodeAtPos(x, y) { 
        return nodes.slice().reverse().find(n => 
            x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height
        ); 
    }

    function getEdgeAtPos(x, y) {
        return edges.find(edge => {
            if (!edge.path) return false;
            for (let i = 0; i < edge.path.length - 1; i++) {
                if (pointToSegmentDistance({ x, y }, edge.path[i], edge.path[i+1]) < 8) return true;
            }
            return false;
        });
    }

    function getAnchorAtPos(x, y) {
        for (const node of nodes) {
            const points = getAttachmentPoints(node);
            for (const key in points) {
                const dist = Math.hypot(x - points[key].x, y - points[key].y);
                if (dist < ANCHOR_HOVER_RADIUS) {
                    return { nodeId: node.id, key, pos: points[key] };
                }
            }
        }
        return null;
    }

    function pointToSegmentDistance(p, p1, p2) {
        const { x, y } = p;
        const { x: x1, y: y1 } = p1;
        const { x: x2, y: y2 } = p2;
        const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
        if (l2 === 0) return Math.hypot(x - x1, y - y1);
        let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1)));
    }

    function clearCanvas() {
        if (confirm('모든 내용을 지우시겠습니까?')) {
            nodes = []; edges = []; selectedItem = null; nodeIdCounter = 0; edgeIdCounter = 0;
            updateFormatPanel(); draw();
        }
    }

    function saveState() {
        const state = { nodes, edges, nodeIdCounter, edgeIdCounter };
        const dataStr = JSON.stringify(state, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'flowchart.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function loadState(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const state = JSON.parse(event.target.result);
                if (state.nodes && state.edges && state.nodeIdCounter != null) {
                    ({ nodes, edges, nodeIdCounter, edgeIdCounter } = state);
                    calculateAllEdgePaths(); draw();
                } else alert('유효하지 않은 파일 형식입니다.');
            } catch (err) { alert('파일을 읽는 중 오류가 발생했습니다.'); }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // --- 프롬프트 생성 --- 
   function generatePrompt() {
    if (!nodes || nodes.length === 0) {
        alert("캔버스에 블록이 없습니다.");
        return;
    }

    const lines = [];

    // --- in/out 맵 만들기 ---
    const inMap = new Map(nodes.map(n => [n.id, []]));
    const outMap = new Map(nodes.map(n => [n.id, []]));
    edges.forEach(e => {
        inMap.get(e.to)?.push(e.from);
        outMap.get(e.from)?.push(e);
    });

    // --- 1단계: 노드 번호 매기기 (화살표 방향 순회) ---
    const nodeNumberMap = new Map();
    let counter = 1;
    const visited = new Set();

    function bfsAssign(startId) {
        const queue = [startId];
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);
            nodeNumberMap.set(current, counter++);
            const outs = outMap.get(current) || [];
            outs.forEach(e => {
                if (!visited.has(e.to)) queue.push(e.to);
            });
        }
    }

    // 시작점 찾기
    const starts = nodes.filter(n => n.shape === 'start');
    if (starts.length > 0) {
        starts.forEach(s => bfsAssign(s.id));
    }

    // 방문 안 된 노드도 번호 부여 (고립 등)
    nodes.forEach(n => {
        if (!nodeNumberMap.has(n.id)) {
            nodeNumberMap.set(n.id, counter++);
        }
    });

    // --- 2단계: 선언 (고립 노드) ---
    const orphanNodes = nodes.filter(n =>
        (inMap.get(n.id).length === 0) &&
        (outMap.get(n.id).length === 0) &&
        n.shape !== 'start' &&
        n.shape !== 'end'
    );
    if (orphanNodes.length > 0) {
        lines.push("## 선언");
        orphanNodes.forEach(n => {
            lines.push(`- "${n.text.replace(/\n/g, ' ')}"`);
        });
        lines.push("");
    }

    lines.push("## 기호 설명");
    lines.push("- START : 시작 지점");
    lines.push("- END : 종료 지점 (중간에 나와도 해당 흐름은 종료됨)");
    lines.push("- ACTION : 동작이나 출력");
    lines.push("- IF : 조건 분기");
    lines.push("- CASE : 조건의 갈래");
    lines.push("- → [n] : 다음으로 이동할 블럭 번호");
    lines.push("");

    lines.push("## 로직");

    // --- 3단계: 출력 ---
    const printed = new Set();

    function printNode(n) {
        if (printed.has(n.id)) return;
        printed.add(n.id);

        const num = nodeNumberMap.get(n.id);
        const outs = outMap.get(n.id) || [];

        if (n.shape === 'start') {
            lines.push(`[${num}] START`);
            outs.forEach(e => lines.push(`    → [${nodeNumberMap.get(e.to)}]`));
        }
        else if (n.shape === 'end') {
            lines.push(`[${num}] END`);
        }
        else if (outs.length > 1) {
            lines.push(`[${num}] IF ("${n.text.replace(/\n/g, ' ')}"):`);
            outs.forEach(e => {
                const label = e.text ? `'${e.text}'` : '(조건 없음)';
                lines.push(`    CASE (${label}) → [${nodeNumberMap.get(e.to)}]`);
            });
        }
        else {
            lines.push(`[${num}] ACTION: "${n.text.replace(/\n/g, ' ')}"`);
            if (outs.length === 1) {
                lines.push(`    → [${nodeNumberMap.get(outs[0].to)}]`);
            }
        }
    }

    // 번호 순서대로 출력
    Array.from(nodeNumberMap.entries())
    .sort((a, b) => a[1] - b[1])   // 번호 기준 정렬
    .forEach(([id]) => {
        const node = nodes.find(n => n.id === id);

        // --- 선언에 이미 들어간 고립 노드는 출력 생략 ---
        if (orphanNodes.includes(node)) return;

        if (node) printNode(node);
    });


    // --- 결과 표시 ---
    const finalPrompt = lines.join("\n");
    document.getElementById('modal-textarea').value = finalPrompt.trim();
    document.getElementById('prompt-modal').style.display = 'flex';
}





    // --- 실행 시작 ---
    init();
});
