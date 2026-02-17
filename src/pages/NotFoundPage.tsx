// src/pages/NotFound.tsx
export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-6xl font-bold">404</h1>
        <p className="mt-4 text-xl">页面未找到</p>
        <a href="/" className="mt-6 inline-block text-blue-500 hover:underline">
          返回首页
        </a>
      </div>
    </div>
  );
}
