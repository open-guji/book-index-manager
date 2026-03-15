/**
 * FileSystem 抽象接口
 * VS Code 端用 vscode.workspace.fs 实现
 * Node.js 端用 fs/promises 实现
 * 浏览器端不适用（通过 HttpTransport 走后端 API）
 */
export interface FileSystem {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    deleteFile(path: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<{ isDirectory: boolean }>;
    /** 递归查找文件，返回匹配的路径列表 */
    glob(dir: string, pattern: string): Promise<string[]>;
}
