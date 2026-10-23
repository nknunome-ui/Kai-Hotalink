// 開発・テスト用のメモリ上の Firestore もどき。
// このアプリが使う範囲（doc/collection/get/set/update/delete/add/orderBy/limit/
// トランザクション/バッチ）だけを実装している。本番では使わない。

type Data = Record<string, unknown>;

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
let autoId = 0;
const newId = () => `mem${Date.now().toString(36)}${(autoId++).toString(36)}`;

function setPath(obj: Data, path: string, value: unknown) {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Data;
  }
  cur[keys.at(-1)!] = clone(value);
}

function deepMerge(target: Data, src: Data): Data {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
      deepMerge(target[k] as Data, v as Data);
    } else target[k] = clone(v);
  }
  return target;
}

export class MemoryDb {
  store = new Map<string, Data>();

  collection(name: string) {
    return new MemCollection(this, name);
  }

  async runTransaction<T>(fn: (tx: MemTx) => Promise<T>): Promise<T> {
    const tx = new MemTx();
    const result = await fn(tx);
    tx.ops.forEach((op) => op());
    return result;
  }

  batch() {
    const ops: (() => void)[] = [];
    return {
      set: (ref: MemDoc, data: Data, opts?: { merge?: boolean }) => void ops.push(() => ref.setSync(data, opts)),
      update: (ref: MemDoc, data: Data) => void ops.push(() => ref.updateSync(data)),
      delete: (ref: MemDoc) => void ops.push(() => ref.deleteSync()),
      commit: async () => ops.forEach((op) => op()),
    };
  }
}

export class MemDoc {
  constructor(
    private db: MemoryDb,
    public path: string,
  ) {}
  get id() {
    return this.path.split("/").at(-1)!;
  }
  collection(name: string) {
    return new MemCollection(this.db, `${this.path}/${name}`);
  }
  snapshot() {
    const d = this.db.store.get(this.path);
    return { id: this.id, exists: d !== undefined, data: () => clone(d) };
  }
  async get() {
    return this.snapshot();
  }
  setSync(data: Data, opts?: { merge?: boolean }) {
    const cur = this.db.store.get(this.path);
    this.db.store.set(this.path, opts?.merge && cur ? deepMerge(cur, data) : clone(data));
  }
  updateSync(data: Data) {
    const cur = this.db.store.get(this.path);
    if (!cur) throw new Error(`NOT_FOUND: ${this.path}`);
    for (const [k, v] of Object.entries(data)) setPath(cur, k, v);
  }
  deleteSync() {
    this.db.store.delete(this.path);
  }
  async set(data: Data, opts?: { merge?: boolean }) {
    this.setSync(data, opts);
  }
  async update(data: Data) {
    this.updateSync(data);
  }
  async delete() {
    this.deleteSync();
  }
}

class MemQuery {
  constructor(
    protected db: MemoryDb,
    public path: string,
    private order?: { field: string; dir: "asc" | "desc" },
    private max?: number,
  ) {}
  orderBy(field: string, dir: "asc" | "desc" = "asc") {
    return new MemQuery(this.db, this.path, { field, dir }, this.max);
  }
  limit(n: number) {
    return new MemQuery(this.db, this.path, this.order, n);
  }
  async get() {
    const prefix = `${this.path}/`;
    let docs = [...this.db.store.keys()]
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
      .map((k) => new MemDoc(this.db, k).snapshot());
    if (this.order) {
      const { field, dir } = this.order;
      docs.sort((a, b) => {
        const x = (a.data() as Data)[field] as string | number;
        const y = (b.data() as Data)[field] as string | number;
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === "desc" ? -1 : 1);
      });
    }
    if (this.max !== undefined) docs = docs.slice(0, this.max);
    return { docs };
  }
}

class MemCollection extends MemQuery {
  doc(id?: string) {
    return new MemDoc(this.db, `${this.path}/${id ?? newId()}`);
  }
  async add(data: Data) {
    const ref = this.doc();
    ref.setSync(data);
    return ref;
  }
}

class MemTx {
  ops: (() => void)[] = [];
  async get(ref: MemDoc) {
    return ref.snapshot();
  }
  set(ref: MemDoc, data: Data, opts?: { merge?: boolean }) {
    this.ops.push(() => ref.setSync(data, opts));
  }
  update(ref: MemDoc, data: Data) {
    this.ops.push(() => ref.updateSync(data));
  }
}
