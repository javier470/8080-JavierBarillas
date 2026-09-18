class FloatingPointCoprocessor {
    static MEMORY_MAP = {
        OPERAND_A: 0x3000,
        OPERAND_B: 0x3004,
        RESULT: 0x3008,
        COMMAND: 0x300C,
        STATUS: 0x300D
    };

    constructor() {
        this.memory = null;
        this.reset();
    }

    reset() {
        this.operandA = 0;
        this.operandB = 0;
        this.result = 0;
        this.command = 0;
        this.status = 'IDLE';
        this.lastOperation = 'Esperando una operación';
        this.cycles = 0;
        this.trace = [];
    }

    attachMemory(memory) {
        this.memory = memory;
    }

    readMemoryWord(address) {
        return [0, 1, 2, 3].reduce((value, offset) => {
            return ((value << 8) | this.memory[(address + offset) & 0xFFFF]) >>> 0;
        }, 0);
    }

    writeMemoryWord(address, value) {
        this.floatBytes(value).forEach((byte, offset) => {
            this.memory[(address + offset) & 0xFFFF] = byte;
        });
    }

    writeMemory(address, value) {
        if (!this.memory) return;
        const map = FloatingPointCoprocessor.MEMORY_MAP;
        if (address >= map.OPERAND_A && address < map.OPERAND_A + 4) {
            this.operandA = this.readMemoryWord(map.OPERAND_A);
        } else if (address >= map.OPERAND_B && address < map.OPERAND_B + 4) {
            this.operandB = this.readMemoryWord(map.OPERAND_B);
        } else if (address === map.COMMAND) {
            this.execute(value);
        }
    }

    readFloat(bytes) {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        bytes.forEach((value, index) => view.setUint8(index, value));
        return view.getFloat32(0, false);
    }

    floatBytes(value) {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setFloat32(0, Number(value), false);
        return [0, 1, 2, 3].map(index => view.getUint8(index));
    }

    writeOperand(which, value) {
        const target = which === 'A' ? 'operandA' : 'operandB';
        this[target] = ((this[target] << 8) | (value & 0xFF)) >>> 0;
    }

    execute(command) {
        const operations = {
            1: ['Suma', (a, b) => a + b],
            2: ['Resta', (a, b) => a - b],
            3: ['Multiplicación', (a, b) => a * b],
            4: ['División', (a, b) => a / b]
        };
        const operation = operations[command];
        if (!operation) return;

        const a = this.readFloat(this.uint32Bytes(this.operandA));
        const b = this.readFloat(this.uint32Bytes(this.operandB));
        this.command = command;
        this.status = 'BUSY';
        this.cycles = 4;
        this.lastOperation = `${operation[0]}: ${a} y ${b}`;
        this.result = operation[1](a, b);
        this.status = Number.isFinite(this.result) ? 'DONE' : 'ERROR';
        if (this.memory) {
            this.writeMemoryWord(FloatingPointCoprocessor.MEMORY_MAP.RESULT, this.result);
            this.memory[FloatingPointCoprocessor.MEMORY_MAP.STATUS] = this.status === 'DONE' ? 1 : 0xFF;
        }
        this.trace.unshift({ operation: operation[0], a, b, result: this.result, cycles: this.cycles });
        this.trace = this.trace.slice(0, 8);
    }

    uint32Bytes(value) {
        return [(value >>> 24) & 0xFF, (value >>> 16) & 0xFF, (value >>> 8) & 0xFF, value & 0xFF];
    }

    readPort(port) {
        if (port >= 0x20 && port <= 0x23) return this.floatBytes(this.result)[port - 0x20];
        if (port === 0x24) return this.status === 'DONE' ? 1 : (this.status === 'ERROR' ? 0xFF : 0);
        return 0;
    }

    writePort(port, value) {
        if (port >= 0x10 && port <= 0x13) this.writeOperand('A', value);
        if (port >= 0x14 && port <= 0x17) this.writeOperand('B', value);
        if (port === 0x18) this.execute(value);
    }

    getBits(value) {
        return this.floatBytes(value).map(byte => byte.toString(2).padStart(8, '0')).join(' ');
    }

    getOperand(which) {
        const value = which === 'A' ? this.operandA : this.operandB;
        return this.readFloat(this.uint32Bytes(value));
    }
}

if (typeof module !== 'undefined') {
    module.exports = FloatingPointCoprocessor;
}