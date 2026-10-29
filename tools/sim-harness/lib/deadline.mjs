// 通信を保留するfixtureでも、期待したイベントが来なければCIを有限時間で失敗させる。
export async function withDeadline(promise, label, milliseconds = 30000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`${label}: ${milliseconds}ms以内に完了しませんでした`),
            ),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
