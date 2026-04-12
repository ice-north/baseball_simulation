import React, { useState } from 'react';

const CATEGORIES = [
  { id: 'batting', label: '打撃能力' },
  { id: 'physical', label: '身体能力' },
  { id: 'fielding', label: '守備能力' },
  { id: 'pitching', label: '投手能力' },
  { id: 'condition', label: 'コンディション' },
  { id: 'fatigue', label: '体力・スタミナ・疲労' },
  { id: 'fitness', label: '守備位置適性' },
  { id: 'pitchRoles', label: '投手起用ロール' },
  { id: 'pitchSubstitution', label: '降板ルール' },
  { id: 'traits', label: '選手特性' },
  { id: 'campMain', label: 'キャンプ：メイン練習' },
  { id: 'campSub', label: 'キャンプ：サブ練習' },
  { id: 'campGrowth', label: 'キャンプ：成長システム' },
  { id: 'campDispatch', label: 'キャンプ：派遣' },
  { id: 'gameflow', label: 'ゲームフロー' },
];

const ManualContent = ({ category }) => {
  switch (category) {
    case 'batting':
      return (
        <div className="space-y-4">
          <Entry title="ミート（meet）" range="1〜99">
            バットにボールを当てる技術。値が高いほどバットの芯でボールを捉えやすく、ヒット性の打球が出やすい。
            コンディションにより±5の補正あり。
          </Entry>
          <Entry title="パワー（power）" range="1〜99">
            打球の飛距離を決める能力。値が高いほど長打・ホームランの確率が上がる。
            コンディションにより±5の補正あり。
          </Entry>
          <Entry title="選球眼（eye）" range="1〜99">
            ストライクとボールを見極める能力。値が高いほど四球を選びやすく、ボール球を振りにくい。
          </Entry>
          <Entry title="盗塁（steal）" range="1〜99">
            盗塁の成功率に関わる能力。スタートの速さや走塁判断力を表す。走力とあわせて盗塁成功率が決まる。
          </Entry>
          <Entry title="打席タイプ（bats）" range="右打 / 左打 / 両打">
            打席の左右。両打（スイッチヒッター）は投手の左右に応じて有利な打席に立てる。
          </Entry>
        </div>
      );

    case 'physical':
      return (
        <div className="space-y-4">
          <Entry title="走力（speed）" range="1〜99">
            足の速さ。内野安打の可能性、走塁での進塁判断、守備での守備範囲にも影響する。
            外野手・遊撃手・二塁手では特に重要。
          </Entry>
          <Entry title="肩力（arm）" range="1〜99">
            送球の強さ。外野からの返球、内野での送球精度に影響する。
            捕手の盗塁阻止率にも関係する。
          </Entry>
          <Entry title="体力（bodyStamina）" range="1〜99">
            シーズン通しての体力。値が低いと疲労がたまりやすく、パフォーマンスが低下する。
            体力バーの色は値に応じて緑→黄緑→黄→橙→赤と変化する。
          </Entry>
          <Entry title="回復力（recovery）" range="1〜99">
            疲労からの回復速度。値が高いほど試合後の疲労回復が早い。
            連戦時に差が出る能力。
          </Entry>
          <Entry title="投球腕（throws）" range="右投 / 左投">
            投球する腕の左右。左投手は左打者に有利、右投手は右打者に有利。
          </Entry>
        </div>
      );

    case 'fielding':
      return (
        <div className="space-y-4">
          <Entry title="守備力（defense）" range="1〜99">
            守備全般の巧さ。捕球・送球の正確性、守備範囲の広さに影響する。
            守備位置適性（fitnessMult）を掛けて最終的な守備力が決まる。
          </Entry>
          <Entry title="守備位置ごとの重要ステータス">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>捕手</b>: 守備力50% + 肩力50%</li>
              <li><b>一塁手</b>: 守備力が最重要</li>
              <li><b>二塁手</b>: 守備力 + 走力</li>
              <li><b>三塁手</b>: 守備力50% + 肩力50%</li>
              <li><b>遊撃手</b>: 守備力 + 走力 + 肩力</li>
              <li><b>中堅手</b>: 守備力30% + 走力50% + 肩力20%</li>
              <li><b>左翼手・右翼手</b>: 守備力 + 肩力</li>
            </ul>
          </Entry>
        </div>
      );

    case 'pitching':
      return (
        <div className="space-y-4">
          <Entry title="球速（velocity）" range="100〜160 km/h">
            ストレートの最高球速。球速が速いほど打者が振り遅れやすく、空振りが取りやすい。
            150km/h超は一流の証。
          </Entry>
          <Entry title="制球力（control）" range="1〜99">
            投球のコントロール。値が高いほどストライクゾーンへ正確に投げ込め、四球が減る。
            コンディションにより±10の補正あり。
          </Entry>
          <Entry title="スタミナ（stamina）" range="30〜150">
            1試合での投球持続力。先発投手は高いスタミナが必要。
            スタミナが切れると球速・制球が低下し、被打率が上がる。
          </Entry>
          <Entry title="変化球（pitches）">
            各投手が持つ球種とそのレベル。レベルが高いほど変化量が大きく、打者が打ちにくい。
            球種の組み合わせも重要で、多彩な球種を持つ投手ほど的を絞りにくい。
          </Entry>
          <Entry title="投球フォーム（form）">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>オーバースロー</b>: 標準的なフォーム</li>
              <li><b>スリークォーター</b>: やや横から投げる</li>
              <li><b>サイドスロー</b>: 球速-10 / 制球+15</li>
              <li><b>アンダースロー</b>: 球速-10 / 制球+15</li>
            </ul>
          </Entry>
        </div>
      );

    case 'condition':
      return (
        <div className="space-y-4">
          <Entry title="コンディション（5段階）">
            毎日変動する選手の調子。試合でのパフォーマンスに直接影響する。
          </Entry>
          <div className="bg-gray-700/50 rounded-lg p-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="text-left py-1 px-2">状態</th>
                  <th className="text-left py-1 px-2">アイコン</th>
                  <th className="text-left py-1 px-2">打撃補正</th>
                  <th className="text-left py-1 px-2">制球補正</th>
                  <th className="text-left py-1 px-2">基本確率</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                <tr><td className="py-1 px-2 text-red-500 font-bold">絶好調</td><td className="px-2">🔥</td><td className="px-2 text-green-400">+5</td><td className="px-2 text-green-400">+10</td><td className="px-2">10%</td></tr>
                <tr><td className="py-1 px-2 text-orange-400 font-bold">好調</td><td className="px-2">😊</td><td className="px-2 text-green-400">+2</td><td className="px-2 text-green-400">+5</td><td className="px-2">15%</td></tr>
                <tr><td className="py-1 px-2 text-yellow-300 font-bold">普通</td><td className="px-2">😐</td><td className="px-2">±0</td><td className="px-2">±0</td><td className="px-2">50%</td></tr>
                <tr><td className="py-1 px-2 text-blue-400 font-bold">不調</td><td className="px-2">😞</td><td className="px-2 text-red-400">-2</td><td className="px-2 text-red-400">-5</td><td className="px-2">15%</td></tr>
                <tr><td className="py-1 px-2 text-blue-700 font-bold">絶不調</td><td className="px-2">😰</td><td className="px-2 text-red-400">-5</td><td className="px-2 text-red-400">-10</td><td className="px-2">10%</td></tr>
              </tbody>
            </table>
          </div>
          <Entry title="年齢による安定度">
            若い選手（18歳）ほどコンディションの波が大きく、ベテラン（38歳）ほど安定して「普通」寄りになる。
          </Entry>
          <Entry title="推移ルール">
            コンディションは1日ごとに変化。現状維持が最も多く、1段階変動は自然に起こるが、2段階以上の急変は稀。
          </Entry>
        </div>
      );

    case 'fatigue':
      return (
        <div className="space-y-4">
          <Entry title="3つのパラメータの関係">
            選手のスタミナ管理には「体力」「スタミナ」「疲労」の3つのパラメータが関わる。
            それぞれ役割が異なり、相互に影響し合う。
            <div className="bg-gray-700/50 rounded-lg p-3 mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-600 text-gray-400">
                    <th className="text-left py-1 px-2">パラメータ</th>
                    <th className="text-left py-1 px-2">対象</th>
                    <th className="text-left py-1 px-2">概要</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr className="border-b border-gray-700"><td className="py-1.5 px-2 text-green-300 font-bold">体力</td><td className="px-2">全選手</td><td className="px-2">試合で溜まる疲労の量を抑える</td></tr>
                  <tr className="border-b border-gray-700"><td className="py-1.5 px-2 text-blue-300 font-bold">スタミナ</td><td className="px-2">投手</td><td className="px-2">1試合内で投げ続けられる球数の目安</td></tr>
                  <tr><td className="py-1.5 px-2 text-red-300 font-bold">疲労</td><td className="px-2">全選手</td><td className="px-2">試合ごとに蓄積し、能力を低下させる</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>

          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-4">体力（bodyStamina）</h3>
          <Entry title="体力とは" range="1〜99">
            シーズンを通した体の丈夫さを表す身体能力。値が高いほど1試合で溜まる疲労が少ない。
            体力自体は試合ごとに変動しない固定パラメータで、キャンプ練習（ランニング）などで成長する。
          </Entry>
          <Entry title="体力と1試合あたりの疲労量（野手）">
            スタメン出場（3打席以上）した野手は、体力に応じた疲労が蓄積する。代打や守備固めでは疲労は溜まらない。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">体力</th>
                  <th className="text-right py-1 px-2">100</th><th className="text-right py-1 px-2">80</th>
                  <th className="text-right py-1 px-2">60</th><th className="text-right py-1 px-2">40</th>
                  <th className="text-right py-1 px-2">20</th><th className="text-right py-1 px-2">1</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-green-300">1試合の疲労</td>
                    <td className="text-right px-2">5</td><td className="text-right px-2">6</td>
                    <td className="text-right px-2">7</td><td className="text-right px-2">8</td>
                    <td className="text-right px-2">9</td><td className="text-right px-2">10</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Entry>

          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1 mt-4">スタミナ（stamina）</h3>
          <Entry title="スタミナとは" range="30〜150">
            投手専用の能力。1試合内で投げ続けられる体力を表す。投球するたびに1ずつ減少し、イニング間に3回復する。
          </Entry>
          <Entry title="疲労によるスタミナ低下">
            試合開始時のスタミナは、蓄積した疲労の分だけ最大値から差し引かれる（最低でも最大値の50%は確保）。
            <code className="bg-gray-800 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              開始スタミナ = max(最大スタミナ × 0.5, 最大スタミナ - 疲労値)
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">例: スタミナ120の投手</th>
                  <th className="text-right py-1 px-2">開始スタミナ</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">疲労 0（完全回復）</td><td className="text-right px-2 text-green-400">120</td></tr>
                  <tr><td className="py-0.5 px-2">疲労 20</td><td className="text-right px-2 text-yellow-300">100</td></tr>
                  <tr><td className="py-0.5 px-2">疲労 50</td><td className="text-right px-2 text-orange-300">70</td></tr>
                  <tr><td className="py-0.5 px-2">疲労 80以上</td><td className="text-right px-2 text-red-400">60（下限）</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="スタミナ低下によるパフォーマンス悪化">
            試合中にスタミナが50%を切ると、球速と制球が急激に低下する（二次曲線）。
            残りスタミナが25%を切ると降板となる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">残スタミナ率</th>
                  <th className="text-right py-1 px-2">球速低下</th><th className="text-right py-1 px-2">制球低下</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">50%以上</td><td className="text-right px-2 text-green-400">なし</td><td className="text-right px-2 text-green-400">なし</td></tr>
                  <tr><td className="py-0.5 px-2">40%</td><td className="text-right px-2 text-yellow-300">-1</td><td className="text-right px-2 text-yellow-300">-1</td></tr>
                  <tr><td className="py-0.5 px-2">30%</td><td className="text-right px-2 text-orange-300">-3</td><td className="text-right px-2 text-orange-300">-5</td></tr>
                  <tr><td className="py-0.5 px-2 text-red-400">25%（降板）</td><td className="text-right px-2 text-red-400">-5</td><td className="text-right px-2 text-red-400">-8</td></tr>
                  <tr><td className="py-0.5 px-2">10%</td><td className="text-right px-2 text-red-400">-13</td><td className="text-right px-2 text-red-400">-19</td></tr>
                  <tr><td className="py-0.5 px-2">0%</td><td className="text-right px-2 text-red-400">-20</td><td className="text-right px-2 text-red-400">-30</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>

          <h3 className="text-red-300 font-bold text-sm border-b border-red-800 pb-1 mt-4">疲労（fatigue）</h3>
          <Entry title="疲労とは">
            試合に出場するたびに蓄積し、能力を低下させる値。休養日に回復する。
            疲労が高い状態で出場し続けると、打撃・投球ともにパフォーマンスが大きく落ちる。
          </Entry>
          <Entry title="疲労の蓄積">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>野手</b>: スタメン出場（3打席以上）で体力に応じた疲労が蓄積（5〜10）</li>
              <li><b>先発投手</b>: 球数 ÷ 2 の疲労が蓄積（100球なら疲労+50）</li>
              <li><b>リリーフ投手</b>: 球数 ÷ 3 の疲労が蓄積（30球なら疲労+10）</li>
              <li>代打（1〜2打席）や守備固めでは疲労は蓄積しない</li>
            </ul>
          </Entry>
          <Entry title="疲労による能力低下">
            疲労は打者・投手の両方に影響する。ペナルティは二次曲線で増加し、疲労が高いほど加速度的に悪化する。
            <code className="bg-gray-800 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              能力低下 = 疲労² ÷ 670（小数点以下四捨五入）
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">疲労値</th>
                  <th className="text-right py-1 px-2">0</th><th className="text-right py-1 px-2">20</th>
                  <th className="text-right py-1 px-2">40</th><th className="text-right py-1 px-2">60</th>
                  <th className="text-right py-1 px-2">80</th><th className="text-right py-1 px-2">100</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-red-300">能力低下</td>
                    <td className="text-right px-2 text-green-400">0</td>
                    <td className="text-right px-2 text-yellow-300">-1</td>
                    <td className="text-right px-2 text-yellow-300">-2</td>
                    <td className="text-right px-2 text-orange-300">-5</td>
                    <td className="text-right px-2 text-red-400">-10</td>
                    <td className="text-right px-2 text-red-400">-15</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li><b>打者</b>: ミート・パワー・走力に上記ペナルティ、選球眼はその半分</li>
              <li><b>投手</b>: 球速・制球に上記ペナルティ（スタミナ低下とは別に適用）</li>
            </ul>
          </Entry>
          <Entry title="疲労の回復">
            日付が進むたびに全選手の疲労が回復する。回復量は「回復力」に依存する。
            <code className="bg-gray-800 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              1日の回復量 = 20 × (0.7 + 回復力 / 100 × 0.6)
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">回復力</th>
                  <th className="text-right py-1 px-2">20</th><th className="text-right py-1 px-2">40</th>
                  <th className="text-right py-1 px-2">50</th><th className="text-right py-1 px-2">70</th>
                  <th className="text-right py-1 px-2">90</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-green-300">1日の回復</td>
                    <td className="text-right px-2">16</td><td className="text-right px-2">19</td>
                    <td className="text-right px-2">20</td><td className="text-right px-2">22</td>
                    <td className="text-right px-2">25</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="運用のポイント">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>先発投手は100球で疲労+50。回復力50なら完全回復に約3日必要</li>
              <li>連戦が続くと野手も疲労が蓄積し、打撃力が低下する</li>
              <li>疲労が高い投手はスタミナも減った状態で登板するため、早期降板のリスクが高まる</li>
              <li>リリーフ投手は球数が少ないため疲労が軽いが、連投には注意</li>
              <li>AI監督は疲労80以上の投手を先発起用しない</li>
            </ul>
          </Entry>
        </div>
      );

    case 'fitness':
      return (
        <div className="space-y-4">
          <Entry title="守備位置適性（positionFitness）" range="0〜100">
            各守備位置での適性度。メインポジションは100、関連ポジションは65〜90、それ以外は30。
          </Entry>
          <Entry title="適性倍率の計算式">
            <code className="bg-gray-800 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              適性倍率 = 0.5 + (適性値 / 100) × 0.5
            </code>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>適性100 → 倍率1.0（100%の能力発揮）</li>
              <li>適性70 → 倍率0.85（85%の能力発揮）</li>
              <li>適性30 → 倍率0.65（65%の能力発揮）</li>
              <li>適性0 → 倍率0.5（50%の能力発揮）</li>
            </ul>
          </Entry>
          <Entry title="関連ポジション（サブポジ適性が高め）">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>捕手</b> → ファースト</li>
              <li><b>一塁手</b> → サード（高）、捕手（中）</li>
              <li><b>二塁手</b> → ショート（高）、サード（中）</li>
              <li><b>三塁手</b> → ファースト・ショート（高）、セカンド（中）</li>
              <li><b>遊撃手</b> → セカンド・サード（高）</li>
              <li><b>外野手</b> → 他の外野ポジション（高）</li>
            </ul>
          </Entry>
          <Entry title="守備分析タブ">
            ラインナップ設定画面の「守備分析」タブで、各選手の守備位置適性と能力値を視覚的に確認できる。
          </Entry>
        </div>
      );

    case 'pitchRoles':
      return (
        <div className="space-y-4">
          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1">先発ロール</h3>
          <Entry title="ゲームメーカー（ace）" range="球数上限: 110球">
            チームの柱。セットアッパー・守護神へ繋ぐ。自動配置では最も総合力が高い先発に設定される。
          </Entry>
          <Entry title="完投型（complete）" range="球数上限: 120球">
            スタミナが続く限り最後まで投げる。球数上限が最も多く、スタミナの高い投手向け。
          </Entry>
          <Entry title="ショートスターター（short）" range="球数上限: 65球">
            序盤3〜4回を目処に交代。スタミナが低い先発や、中継ぎ陣が厚い場合に有効。
          </Entry>
          <Entry title="勝ち権利交代（quality）" range="球数上限: 100球">
            5〜6回を投げ切ることを目標に投球。勝ち投手の権利取得後、状態を見て交代する標準的な運用。
          </Entry>

          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">リリーフロール</h3>
          <Entry title="ロングリリーフ（long）" range="球数上限: 60球">
            複数イニングを投げるリリーフ。先発が早期降板した際のロング救援要員。
          </Entry>
          <Entry title="中継ぎエース（ace_relief）" range="球数上限: 40球">
            勝ちパターンの中核を担うリリーフ。重要な場面で登板する。
          </Entry>
          <Entry title="ワンポイント（onepoint）" range="球数上限: 15球">
            1打者限定で起用されるリリーフ。主に左投手が左打者を抑えるために登板する。
          </Entry>
          <Entry title="セットアッパー（setup）" range="球数上限: 35球">
            8回を任されるリリーフ。守護神へ繋ぐ重要な役割。僅差で優勢の場面で登板する。
          </Entry>
          <Entry title="守護神（closer）" range="球数上限: 40球">
            9回を締めくくるクローザー。3点差以内のリードで登板し、セーブを記録する。
          </Entry>
          <Entry title="敗戦処理（mopup）" range="球数上限: 50球">
            大差で負けている場面で登板。主力リリーフを温存する役割。
          </Entry>
          <Entry title="ビハインド（behind）" range="球数上限: 50球">
            僅差でビハインドの場面で登板するリリーフ。逆転を許さず試合を作る。
          </Entry>
        </div>
      );

    case 'pitchSubstitution':
      return (
        <div className="space-y-4">
          <Entry title="降板判定の概要">
            投手の降板は以下の3条件のいずれか1つでも満たした時点で、現在の対戦（打席）が終わり次第降板となる。
          </Entry>

          <h3 className="text-red-300 font-bold text-sm border-b border-red-800 pb-1 mt-4">条件1: 球数制限</h3>
          <Entry title="ロール別の球数上限">
            各ロールに設定された球数上限に到達した時点で降板。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">ロール</th><th className="text-right py-1 px-2">球数上限</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-blue-300">完投型</td><td className="text-right px-2">120球</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">ゲームメーカー</td><td className="text-right px-2">110球</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">勝ち権利交代</td><td className="text-right px-2">100球</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">ショートスターター</td><td className="text-right px-2">65球</td></tr>
                  <tr className="border-t border-gray-600"><td className="py-0.5 px-2 text-green-300">ロングリリーフ</td><td className="text-right px-2">60球</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">敗戦処理 / ビハインド</td><td className="text-right px-2">50球</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">守護神 / 中継ぎエース</td><td className="text-right px-2">40球</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">セットアッパー</td><td className="text-right px-2">35球</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">ワンポイント</td><td className="text-right px-2">15球</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>

          <h3 className="text-yellow-300 font-bold text-sm border-b border-yellow-800 pb-1 mt-4">条件2: スタミナ限界</h3>
          <Entry title="スタミナ25%以下で降板">
            先発・リリーフ問わず、残りスタミナが最大値の25%を切った時点で降板。
            スタミナは投球ごとに消費され、イニング間でわずかに回復する。
          </Entry>

          <h3 className="text-orange-300 font-bold text-sm border-b border-orange-800 pb-1 mt-4">条件3: ダメージポイント制（先発のみ）</h3>
          <Entry title="ダメージポイント（DP）とは">
            先発投手が打たれた内容に応じてダメージポイント（DP）が積算される。
            イニングごとに設定された閾値を超えると降板となる。
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li><b>単打・四球</b>: +4ポイント</li>
              <li><b>長打</b>（二塁打・三塁打・本塁打）: +6ポイント</li>
              <li><b>失点</b>: +10ポイント（1点につき）</li>
            </ul>
          </Entry>
          <Entry title="イニング別の閾値">
            イニングが進むほど閾値が下がり、終盤では少しのダメージでも降板しやすくなる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">イニング</th>
                  <th className="text-right py-1 px-2">1回</th><th className="text-right py-1 px-2">2回</th>
                  <th className="text-right py-1 px-2">3回</th><th className="text-right py-1 px-2">4回</th>
                  <th className="text-right py-1 px-2">5回</th><th className="text-right py-1 px-2">6回</th>
                  <th className="text-right py-1 px-2">7回</th><th className="text-right py-1 px-2">8回</th>
                  <th className="text-right py-1 px-2">9回</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-orange-300">閾値</td>
                    <td className="text-right px-2">45</td><td className="text-right px-2">40</td>
                    <td className="text-right px-2">35</td><td className="text-right px-2">30</td>
                    <td className="text-right px-2">25</td><td className="text-right px-2">20</td>
                    <td className="text-right px-2">15</td><td className="text-right px-2">10</td>
                    <td className="text-right px-2">5</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="イニングまたぎの回復">
            イニングが変わるごとにDPが10ポイント回復する（最低0）。
            これにより、1イニング抑えればダメージが緩和され、好投すれば長く投げられる。
          </Entry>
          <Entry title="DP計算の例">
            <div className="text-sm space-y-1 mt-1">
              <p>例: 3回表に単打(+4)→四球(+4)→二塁打(+6)→失点(+10) = DP24</p>
              <p>→ 3回の閾値35なので続投。4回へまたぎで-10 → DP14</p>
              <p>→ 4回に単打(+4)→失点(+10) = DP28。4回の閾値30なので続投。</p>
              <p>→ 5回へまたぎで-10 → DP18。もう1本単打(+4) = DP22。</p>
              <p>→ 5回の閾値25なので続投。さらに失点(+10) = DP32 {'>'} 25で降板。</p>
            </div>
          </Entry>
        </div>
      );

    case 'traits':
      return (
        <div className="space-y-4">
          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1">野手特性</h3>
          <Entry title="俊足（speedster）">
            走力85〜99、盗塁80〜95と圧倒的な脚力を持つ。ミート・パワーは控えめ。
          </Entry>
          <Entry title="強打（slugger）">
            パワー67〜76と高い長打力。走力・盗塁は低め。典型的なパワーヒッター。
          </Entry>
          <Entry title="守備職人（defender）">
            守備85〜99、肩力75〜90。守備の名手。打撃は平均的。
          </Entry>
          <Entry title="巧打（contactHitter）">
            ミート70〜79、選球眼75〜90。安打製造機。パワーは控えめ。
          </Entry>
          <Entry title="選球眼（eyeMaster）">
            選球眼80〜95と高い出塁能力。四球を多く選べる。
          </Entry>
          <Entry title="走塁巧者（baserunner）">
            走力75〜90、盗塁80〜99。俊足に加え走塁技術が高い。
          </Entry>
          <Entry title="強肩（armStrong）">
            肩力80〜99、守備65〜85。強肩の外野手・捕手向き。パワーも高め。
          </Entry>

          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">投手特性</h3>
          <Entry title="速球派（fireballer）">
            球速141〜154km/h。球の速さで押す投手。制球はやや荒い。
          </Entry>
          <Entry title="制球派（controlPitcher）">
            制球75〜95と高いコントロール。球速は控えめだがスタミナも高い。
          </Entry>
          <Entry title="鉄腕（ironman）">
            スタミナ120〜147と驚異的なスタミナ。長いイニングを投げ切れる。
          </Entry>
          <Entry title="変化球（breakingBall）">
            制球55〜85と安定した変化球投手。球速は平均的だがスタミナは高め。
          </Entry>
          <Entry title="特性の付与ルール">
            選手生成時にランダムで0〜2個の特性が付与される。特性なし50%、1つ35%、2つ15%の確率。
            複数特性が重なった場合は、各能力値のうち高い方が採用される。
          </Entry>
        </div>
      );

    case 'campMain':
      return (
        <div className="space-y-4">
          <Entry title="キャンプの概要">
            キャンプは4クール。毎クール、メイン練習1つ＋サブ練習1つを選択して実行する。
            成長量は選手の年齢・経験値・ポジション補正により変動し、能力値80以上では成長が減衰する。
          </Entry>
          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1">メイン練習一覧</h3>
          <Entry title="打撃練習 🏏" range="野手向け">
            ミートとパワーを強化する。1クールあたり各+0〜2程度。
          </Entry>
          <Entry title="走塁練習 🏃" range="野手向け">
            走力と盗塁を強化する。1クールあたり各+0〜2程度。
          </Entry>
          <Entry title="守備練習 🧤" range="共通">
            守備力と肩力を強化する。投手・野手共通で選択可能。1クールあたり各+0〜2程度。
          </Entry>
          <Entry title="選球眼練習 👁️" range="野手向け">
            選球眼を集中的に強化する。1クールあたり+0〜2程度。
          </Entry>
          <Entry title="スタミナ練習 💪" range="投手向け">
            投手のスタミナを強化する。1クールあたり+0〜2程度。
          </Entry>
          <Entry title="制球練習 🎯" range="投手向け">
            制球力を強化する。1クールあたり+0〜2程度。
          </Entry>
          <Entry title="球速練習 ⚡" range="投手のみ">
            球速を強化する。1クールあたり+0〜2km程度。155km/h以上では1kmごとに成長が20%減衰する。
          </Entry>
          <Entry title="新球種習得 ✨" range="投手のみ">
            新しい変化球の習得に挑戦する。習得する球種を選択可能。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">結果</th>
                  <th className="text-right py-1 px-2">確率</th>
                  <th className="text-right py-1 px-2">初期レベル</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-yellow-300">大成功</td><td className="text-right px-2">25%</td><td className="text-right px-2 text-green-400">Lv65〜75</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">成功</td><td className="text-right px-2">50%</td><td className="text-right px-2">Lv10〜19</td></tr>
                  <tr><td className="py-0.5 px-2 text-red-400">失敗</td><td className="text-right px-2">25%</td><td className="text-right px-2 text-gray-500">習得不可</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="習得可能な球種">
            スライダー、カーブ、フォーク、チェンジアップ、シンカー、シュート、カッター、スプリット、ツーシーム、パーム、ナックル（最大8球種まで）
          </Entry>
        </div>
      );

    case 'campSub':
      return (
        <div className="space-y-4">
          <Entry title="サブ練習の基本">
            メイン練習より効果は小さい。基本的に40%の確率で+1、そのうち30%で+2（=全体で12%が+2、28%が+1、60%が成長なし）。
          </Entry>
          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1">サブ練習一覧</h3>
          <Entry title="ランニング 🏃" range="安定枠">
            走力+0〜2、体力+1〜4（確定）、投手のみスタミナ+1（20%）。体力が確実に伸びる安定したメニュー。
          </Entry>
          <Entry title="筋トレ 💪">
            パワー+0〜2、肩力+1（25%）。パワー系の強化に。
          </Entry>
          <Entry title="ストレッチ 🧘" range="広く薄く">
            ミート・パワー・走力・肩力・守備が各10%で+1、回復力+1（30%）。広く薄い効果。
          </Entry>
          <Entry title="守備補強 🧤">
            守備+0〜2、低適性のポジション適性+3（30%）。守備力の底上げに。
          </Entry>
          <Entry title="選球眼練習 👁️">
            選球眼+0〜2。選球眼を手軽に鍛えたいときに。
          </Entry>
          <Entry title="変化球練習 🌀" range="投手のみ">
            保有する全変化球のレベルが+1/クール程度。年齢補正あり。
          </Entry>
          <Entry title="サブポジ練習 🔀" range="ポジション選択可">
            指定したポジションの守備適性が+9〜15。コンバートやユーティリティ育成に最適。
          </Entry>
          <Entry title="Cリード学習 🧠" range="捕手向け">
            キャッチャーリード+1〜3（確定）。捕手の配球力を高める。
          </Entry>
          <h3 className="text-red-300 font-bold text-sm border-b border-red-800 pb-1 mt-6">ハイリスクメニュー</h3>
          <Entry title="新球種習得 ✨" range="投手のみ">
            成功率12%でランダムな球種を習得（成功時Lv20〜39）。メイン練習版より低確率だが、サブ枠で挑戦可能。
          </Entry>
          <Entry title="フォーム改造 🔄" range="投手のみ">
            投球フォームの変更に挑戦する。失敗リスクあり。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>成功（20%）</b>: フォーム変更＋制球+3〜5</li>
              <li><b>失敗（80%）</b>: 制球-1〜3のペナルティ</li>
            </ul>
          </Entry>
          <Entry title="打席変更 ↔️" range="ハイリスク">
            打席の左右やスイッチヒッターへの変更に挑戦する。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">変更パターン</th>
                  <th className="text-right py-1 px-2">成功率</th>
                  <th className="text-right py-1 px-2">失敗時ペナルティ</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">片打→両打（スイッチ化）</td><td className="text-right px-2">15%</td><td className="text-right px-2 text-red-400">ミート-1〜2</td></tr>
                  <tr><td className="py-0.5 px-2">片打→反対の打席</td><td className="text-right px-2">20%</td><td className="text-right px-2 text-red-400">ミート-1〜2</td></tr>
                  <tr><td className="py-0.5 px-2">両打→片打</td><td className="text-right px-2">30%</td><td className="text-right px-2 text-red-400">ミート-1〜2</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
        </div>
      );

    case 'campGrowth':
      return (
        <div className="space-y-4">
          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1">年齢による成長カーブ</h3>
          <Entry title="フィジカル系（走力・肩力・スタミナ・球速・体力・回復）">
            若いほど大きく成長し、20歳以下がピーク。28歳以降は衰えが始まる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">年齢</th>
                  <th className="text-right py-1 px-2">〜20</th><th className="text-right py-1 px-2">〜22</th>
                  <th className="text-right py-1 px-2">〜25</th><th className="text-right py-1 px-2">〜28</th>
                  <th className="text-right py-1 px-2">〜31</th><th className="text-right py-1 px-2">〜34</th>
                  <th className="text-right py-1 px-2">35+</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-green-300">成長補正</td>
                    <td className="text-right px-2 text-green-400">+2.5</td>
                    <td className="text-right px-2 text-green-400">+1.8</td>
                    <td className="text-right px-2 text-green-400">+0.8</td>
                    <td className="text-right px-2 text-yellow-300">+0.1</td>
                    <td className="text-right px-2 text-red-400">-0.5</td>
                    <td className="text-right px-2 text-red-400">-1.2</td>
                    <td className="text-right px-2 text-red-400">-2.0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="技術系（ミート・パワー・選球眼・制球・守備・盗塁）">
            22〜24歳が成長のピーク。フィジカル系より遅咲きで、30歳前後まで伸びやすい。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">年齢</th>
                  <th className="text-right py-1 px-2">〜21</th><th className="text-right py-1 px-2">〜24</th>
                  <th className="text-right py-1 px-2">〜27</th><th className="text-right py-1 px-2">〜30</th>
                  <th className="text-right py-1 px-2">〜33</th><th className="text-right py-1 px-2">〜36</th>
                  <th className="text-right py-1 px-2">37+</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-green-300">成長補正</td>
                    <td className="text-right px-2 text-green-400">+1.0</td>
                    <td className="text-right px-2 text-green-400">+2.2</td>
                    <td className="text-right px-2 text-green-400">+1.5</td>
                    <td className="text-right px-2 text-yellow-300">+0.3</td>
                    <td className="text-right px-2 text-red-400">-0.3</td>
                    <td className="text-right px-2 text-red-400">-1.0</td>
                    <td className="text-right px-2 text-red-400">-2.0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">成長減衰</h3>
          <Entry title="能力値80以上の減衰">
            能力値が80を超えると、超過1ポイントごとに成長量が3%減衰する。
            例えば能力値90なら成長量が70%に、能力値99なら43%まで減少する。
          </Entry>
          <Entry title="球速155km/h以上の減衰">
            球速は155km/hを超えると超過1kmごとに成長量が20%減衰する。
            156km/hで80%、157km/hで60%…と急激に伸びにくくなる。上限は175km/h。
          </Entry>
          <h3 className="text-yellow-300 font-bold text-sm border-b border-yellow-800 pb-1 mt-6">覚醒システム</h3>
          <Entry title="覚醒とは">
            メイン練習中に一定確率で発生する大幅な追加成長。覚醒分は成長減衰の影響を受けない。
          </Entry>
          <Entry title="覚醒の発生条件">
            覚醒率は経験値に依存する。
            <code className="bg-gray-800 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              覚醒率 = 経験値 ÷ 10（%）
            </code>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>経験値100の選手 → 覚醒率10%</li>
              <li>経験値250の選手 → 覚醒率25%</li>
            </ul>
          </Entry>
          <Entry title="経験値の稼ぎ方">
            シーズン中の出場実績に応じて経験値が蓄積される。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>投手</b>: 登板数 + 投球回数</li>
              <li><b>野手</b>: 出場試合数 + 打席数÷3</li>
            </ul>
            フル出場なら1シーズンで約250ポイント。キャンプ練習後に経験値は30%に減少する。
          </Entry>
          <Entry title="ポジション・打順による成長ボーナス">
            シーズン中の守備位置や打順に応じて、関連するステータスの成長にボーナスがかかる。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>例: 遊撃手 → 走力・守備の成長1.4倍</li>
              <li>例: 4番打者 → パワーの成長1.5倍</li>
              <li>例: 1番打者 → 走力・盗塁の成長1.4倍</li>
            </ul>
          </Entry>
        </div>
      );

    case 'campDispatch':
      return (
        <div className="space-y-4">
          <Entry title="派遣とは">
            Year2以降のキャンプで利用可能。選手をキャンプ全期間、外部機関に派遣して育成する。
            派遣した選手は通常のキャンプ練習には参加できない。結果はキャンプ終了時に判明する。
          </Entry>
          <Entry title="派遣の制限">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>各チーム、各派遣先に1人ずつ派遣可能</li>
              <li>リーグ全体で合計8人まで</li>
            </ul>
          </Entry>
          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1 mt-4">派遣先</h3>
          <Entry title="🎓 大学野球留学" range="22歳以下 / 総合力55以下">
            技術系の能力が大幅に伸びる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">対象</th>
                  <th className="text-left py-1 px-2">主な成長能力</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-blue-300">投手</td><td className="px-2">制球+8〜17、球速+1〜3、変化球+5〜12、スタミナ+5〜14</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">野手</td><td className="px-2">ミート+8〜17、選球眼+6〜13、守備+5〜10、パワー+2〜5</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="🏟️ プロ研修" range="24歳以下 / 総合力50以下">
            フィジカル系の能力が大幅に伸びる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">対象</th>
                  <th className="text-left py-1 px-2">主な成長能力</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-blue-300">投手</td><td className="px-2">球速+4〜8、スタミナ+10〜24、制球+2〜5</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">野手</td><td className="px-2">パワー+8〜17、走力+6〜13、肩力+4〜9、ミート+2〜5</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">成長と飛躍</h3>
          <Entry title="結果判定">
            派遣の結果は「成長」と「飛躍」の2段階。失敗はない。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">結果</th>
                  <th className="text-right py-1 px-2">基本確率</th>
                  <th className="text-right py-1 px-2">成長倍率</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">成長</td><td className="text-right px-2">60%</td><td className="text-right px-2">×1.0</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-300">飛躍</td><td className="text-right px-2">40%</td><td className="text-right px-2 text-green-400">×1.5</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="経験値による飛躍率ボーナス">
            選手の経験値が高いほど飛躍の確率が上がる。
            <code className="bg-gray-800 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              飛躍率 = 40% + min(25%, 経験値÷200)
            </code>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>経験値0 → 飛躍率40%</li>
              <li>経験値100 → 飛躍率52.5%（+12.5%）</li>
              <li>経験値200以上 → 飛躍率65%（上限）</li>
            </ul>
          </Entry>
          <h3 className="text-yellow-300 font-bold text-sm border-b border-yellow-800 pb-1 mt-6">覚醒チャンス</h3>
          <Entry title="派遣中の覚醒">
            派遣でも覚醒が発生する可能性がある。覚醒時はランダムな能力に+5〜12の追加ボーナス（倍率適用後）。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-400 border-b border-gray-600">
                  <th className="text-left py-1 px-2">派遣結果</th>
                  <th className="text-right py-1 px-2">覚醒発生率</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">成長時</td><td className="text-right px-2">20%</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-300">飛躍時</td><td className="text-right px-2">30%</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="覚醒の対象能力">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>投手</b>: 球速または制球のいずれかがランダムで大幅UP</li>
              <li><b>野手</b>: ミート・パワー・走力のいずれかがランダムで大幅UP</li>
            </ul>
          </Entry>
          <Entry title="総合力の計算">
            派遣条件の「総合力」は以下の式で算出される。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>投手</b>: ((球速-115)×1.5 + 制球 + スタミナ÷3) ÷ 3</li>
              <li><b>野手</b>: (ミート + パワー + 走力 + 守備) ÷ 4</li>
            </ul>
          </Entry>
        </div>
      );

    case 'gameflow':
      return (
        <div className="space-y-4">
          <Entry title="ゲームの流れ">
            <ol className="list-decimal list-inside text-sm space-y-2 mt-1">
              <li><b>NEW GAME</b> → レギュレーション設定（チーム数・試合数等を決定）</li>
              <li><b>トライアウト</b> → 24人の候補選手からドラフトでロスターを構築</li>
              <li><b>キャンプ</b> → シーズン前の練習期間</li>
              <li><b>レギュラーシーズン</b> → 日付進行で試合を自動消化</li>
              <li><b>プレーオフ</b> → 上位チームによるトーナメント</li>
              <li><b>ドラフト</b> → 新戦力の獲得</li>
              <li><b>オフシーズン</b> → 表彰式・引退・契約更新</li>
              <li>Year 2以降 → トライアウト（15人）→ ロスター調整 → キャンプ → シーズン…</li>
            </ol>
          </Entry>
          <Entry title="能力値ランク">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-pink-400 font-bold">S</td><td className="px-2">90〜99</td><td className="px-2 text-gray-400">超一流</td></tr>
                  <tr><td className="py-0.5 px-2 text-red-400 font-bold">A</td><td className="px-2">80〜89</td><td className="px-2 text-gray-400">一流</td></tr>
                  <tr><td className="py-0.5 px-2 text-orange-400 font-bold">B</td><td className="px-2">70〜79</td><td className="px-2 text-gray-400">好選手</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-400 font-bold">C</td><td className="px-2">60〜69</td><td className="px-2 text-gray-400">平均以上</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-400 font-bold">D</td><td className="px-2">50〜59</td><td className="px-2 text-gray-400">平均的</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-400 font-bold">E</td><td className="px-2">40〜49</td><td className="px-2 text-gray-400">やや劣る</td></tr>
                  <tr><td className="py-0.5 px-2 text-gray-400 font-bold">F</td><td className="px-2">1〜39</td><td className="px-2 text-gray-400">苦手</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="疲労システム">
            試合に出場すると疲労が蓄積。疲労が高いと能力が低下する。
            回復力が高い選手ほど疲労の回復が早い。連戦時はローテーション管理が重要。
            詳細は「体力・スタミナ・疲労」ページを参照。
          </Entry>
        </div>
      );

    default:
      return null;
  }
};

const Entry = ({ title, range, children }) => (
  <div className="bg-gray-700/40 rounded-lg p-3">
    <div className="flex items-baseline gap-2 mb-1">
      <h4 className="text-yellow-300 font-bold text-sm">{title}</h4>
      {range && <span className="text-[11px] text-gray-400 bg-gray-600/60 px-1.5 py-0.5 rounded">{range}</span>}
    </div>
    <div className="text-gray-300 text-sm leading-relaxed">{children}</div>
  </div>
);

const ManualScreen = ({ onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState('batting');

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <div className="max-w-4xl mx-auto p-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">MANUAL</h1>
            <span className="text-gray-400 text-sm">～ゲーム辞典～</span>
          </div>
          <button
            onClick={onBack}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
          >
            戻る
          </button>
        </div>

        <div className="flex gap-4">
          {/* カテゴリナビ */}
          <div className="w-44 shrink-0">
            <div className="flex flex-col gap-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`text-left px-3 py-2 rounded-lg text-sm transition ${
                    selectedCategory === cat.id
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* コンテンツ */}
          <div className="flex-1 min-w-0">
            <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700/50">
              <h2 className="text-lg font-bold mb-4 text-blue-300 border-b border-gray-700 pb-2">
                {CATEGORIES.find(c => c.id === selectedCategory)?.label}
              </h2>
              <ManualContent category={selectedCategory} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualScreen;
