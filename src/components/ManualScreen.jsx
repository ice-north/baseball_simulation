import React, { useState } from 'react';
import { ScreenShell } from './GameUIComponents.jsx';

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
  { id: 'pitchCalling', label: '配球とコース' },
  { id: 'batterRead', label: '打者の読みと振り方' },
  { id: 'ballTypes', label: '球種と持ち球' },
  { id: 'battedBall', label: '打球と守備' },
  { id: 'traits', label: '選手特性' },
  { id: 'campMain', label: 'キャンプ：メイン練習' },
  { id: 'campSub', label: 'キャンプ：サブ練習' },
  { id: 'campGrowth', label: 'キャンプ：成長システム' },
  { id: 'campDispatch', label: 'キャンプ：派遣' },
  { id: 'growth', label: '年次成長' },
  { id: 'career', label: '進路とドラフト' },
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
          <Entry title="球速（velocity）" range="110km/h 〜 肩力による">
            ストレートの最高球速。速いほど打者の反応時間が削られ、空振りが取れる。
            <b className="text-yellow-300">上限は肩力で決まる</b>——生成でも成長でも次の式を超えない。
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              球速の上限 = 130 + (肩力 - 50) × 0.7
            </code>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>肩力50 → 130km/h まで／肩力80 → 151km/h まで／肩力100 → 165km/h まで</li>
              <li>肩力に対して球速が遅い投手は<b>球速の伸びにボーナス</b>が付く（投げ方の改善）</li>
              <li>160km/hは10年に1人、155km/hは年2〜3人の水準</li>
            </ul>
          </Entry>
          <Entry title="制球力（control）" range="1〜99">
            <b className="text-yellow-300">「ストライクが入る率」ではなく「狙ったところへ投げられる再現性」</b>。
            捕手が要求したマスからのばらつき（σ）が制球で決まる。
            コンディションにより±10の補正あり。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">制球</th>
                  <th className="text-right py-1 px-2">20</th><th className="text-right py-1 px-2">40</th>
                  <th className="text-right py-1 px-2">60</th><th className="text-right py-1 px-2">80</th>
                  <th className="text-right py-1 px-2">100</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">9回あたり四球</td>
                    <td className="text-right px-2 text-red-400">7.3</td><td className="text-right px-2">5.2</td>
                    <td className="text-right px-2">3.5</td><td className="text-right px-2">2.1</td>
                    <td className="text-right px-2 text-green-400">0.69</td></tr>
                  <tr><td className="py-0.5 px-2">ストライク率</td>
                    <td className="text-right px-2">56%</td><td className="text-right px-2">60%</td>
                    <td className="text-right px-2">63%</td><td className="text-right px-2">68%</td>
                    <td className="text-right px-2">76%</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">制球が良い投手は<b>ボール球もストライクに見える</b>ため、打者に振ってもらいやすい。</p>
          </Entry>
          <Entry title="スタミナ（stamina）" range="30〜150">
            1試合での投球持続力。投球ごとに1減り、イニング間に3回復する。
            スタミナが50%を切ると球速・制球が急激に落ち、25%で降板となる。
          </Entry>
          <Entry title="出どころ（deception）" range="1〜99">
            球持ちの長さ・体の陰から腕が出る度合い。<b className="text-yellow-300">球速を上げるのとは別の軸</b>で、
            打者の反応時間を削るうえに<b>球種そのものを見分けにくくする</b>（速いだけの球は「何が来るか」までは隠せない）。
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>平均50・分布は9〜91。「見えない」「丸見え」は各5%程度</li>
              <li>出どころ30→80で防御率が約0.42改善（捕手のリードと同程度の重み）</li>
              <li><b>遅い投手ほどよく効く</b>（132km -0.44 / 150km -0.38）</li>
              <li>球速135・制球78・出どころ82の技巧派が、球速148の速球派を上回ることがある</li>
            </ul>
            <p className="text-sm mt-2 text-gray-400">選手詳細の投球系にバーで表示される。</p>
          </Entry>
          <Entry title="変化球（arsenal）">
            持ち球とそのレベル。詳しくは「球種と持ち球」のページを参照。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>球種ごとに<b>空振り・ゴロ・凡打</b>の性格が違う</li>
              <li><b>何本持っているかより、何を持っているか</b>——似た球を並べても引き出しは増えない</li>
              <li>レベル20未満は「覚えたてでむしろ損」（四球が増えるだけ）</li>
            </ul>
          </Entry>
          <Entry title="投球フォーム（form）">
            球速に倍率が掛かり、成長の伸びやすさも変わる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">フォーム</th>
                  <th className="text-right py-1 px-2">球速倍率</th>
                  <th className="text-right py-1 px-2">球速の伸び</th>
                  <th className="text-right py-1 px-2">制球の伸び</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">オーバースロー</td><td className="text-right px-2">×1.00</td><td className="text-right px-2 text-green-400">×1.1</td><td className="text-right px-2">×0.9</td></tr>
                  <tr><td className="py-0.5 px-2">スリークォーター</td><td className="text-right px-2">×0.98</td><td className="text-right px-2">×1.0</td><td className="text-right px-2">×1.0</td></tr>
                  <tr><td className="py-0.5 px-2">サイドスロー</td><td className="text-right px-2">×0.95</td><td className="text-right px-2">×0.9</td><td className="text-right px-2 text-green-400">×1.1</td></tr>
                  <tr><td className="py-0.5 px-2">アンダースロー</td><td className="text-right px-2 text-red-400">×0.92</td><td className="text-right px-2 text-red-400">×0.8</td><td className="text-right px-2 text-green-400">×1.2</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>サイド・アンダーは生成時に<b>制球+8</b>、同じ利き腕の打者に空振りを取りやすい</li>
              <li><b>フォームには相性の良い球種がある</b>（サイド・アンダー＝シンカー / カーブ など）。
                  適性球は試合での効きが×1.30、適性外は×0.88になる</li>
              <li className="text-gray-400">ただし球速の倍率のほうが影響は大きく、腕を下げると総合的には不利
                  （同じ素の球速145で オーバー2.42 対 アンダー2.87）</li>
            </ul>
          </Entry>
        </div>
      );

    case 'condition':
      return (
        <div className="space-y-4">
          <Entry title="コンディション（5段階）">
            毎日変動する選手の調子。試合でのパフォーマンスに直接影響する。
            打撃補正は<b>ミートとパワーで幅が違う</b>（選球眼は対象外）。
            パワーは本塁打への効き方が急なので、ミートの半分に抑えてある。
          </Entry>
          <div className="bg-gray-700/50 rounded-lg p-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="text-left py-1 px-2">状態</th>
                  <th className="text-left py-1 px-2">アイコン</th>
                  <th className="text-left py-1 px-2">ミート</th>
                  <th className="text-left py-1 px-2">パワー</th>
                  <th className="text-left py-1 px-2">制球</th>
                  <th className="text-left py-1 px-2">基本確率</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                <tr><td className="py-1 px-2 text-red-500 font-bold">絶好調</td><td className="px-2">🔥</td><td className="px-2 text-green-400">+10</td><td className="px-2 text-green-400">+5</td><td className="px-2 text-green-400">+10</td><td className="px-2">10%</td></tr>
                <tr><td className="py-1 px-2 text-orange-400 font-bold">好調</td><td className="px-2">😊</td><td className="px-2 text-green-400">+4</td><td className="px-2 text-green-400">+2</td><td className="px-2 text-green-400">+5</td><td className="px-2">15%</td></tr>
                <tr><td className="py-1 px-2 text-yellow-300 font-bold">普通</td><td className="px-2">😐</td><td className="px-2">±0</td><td className="px-2">±0</td><td className="px-2">±0</td><td className="px-2">50%</td></tr>
                <tr><td className="py-1 px-2 text-blue-400 font-bold">不調</td><td className="px-2">😞</td><td className="px-2 text-red-400">-4</td><td className="px-2 text-red-400">-2</td><td className="px-2 text-red-400">-5</td><td className="px-2">15%</td></tr>
                <tr><td className="py-1 px-2 text-blue-700 font-bold">絶不調</td><td className="px-2">😰</td><td className="px-2 text-red-400">-10</td><td className="px-2 text-red-400">-5</td><td className="px-2 text-red-400">-10</td><td className="px-2">10%</td></tr>
              </tbody>
            </table>
          </div>
          <Entry title="年齢による安定度">
            若い選手（18歳）ほどコンディションの波が大きく、ベテラン（38歳）ほど安定して「普通」寄りになる。
          </Entry>
          <Entry title="推移ルール">
            コンディションは1日ごとに変化。現状維持が最も多く、1段階変動は自然に起こるが、2段階以上の急変は稀。
          </Entry>
          <Entry title="調子で成績がどれだけ変わるか">
            全打者を同じコンディションに固定してリーグを回した実測。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">状態</th>
                  <th className="text-right py-1 px-2">打率</th><th className="text-right py-1 px-2">長打率</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-red-500 font-bold">絶好調</td><td className="text-right px-2 text-green-400">.280</td><td className="text-right px-2 text-green-400">.436</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-300 font-bold">普通</td><td className="text-right px-2">.244</td><td className="text-right px-2">.347</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-700 font-bold">絶不調</td><td className="text-right px-2 text-red-400">.214</td><td className="text-right px-2 text-red-400">.276</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>絶好調と絶不調で<b className="text-yellow-300">打率が6分6厘違う</b>。今日の調子を見て起用を決める意味がある</li>
              <li>長打はさらに振れる（長打率 .276 → .436）。<b>本塁打は絶好調の日に約3倍</b>出る</li>
              <li><b>リーグ全体の成績は動かない</b>（分布も補正も対称なので平均0）。
                  変わるのは個人の日ごとの振れ幅だけ</li>
              <li>若い選手ほど波が大きく、ベテランほど「普通」に寄る</li>
            </ul>
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
                  <tr className="border-b border-gray-600 text-gray-300">
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
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              1試合の疲労 = 15 - 体力 ÷ 100 × 8
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">体力</th>
                  <th className="text-right py-1 px-2">100</th><th className="text-right py-1 px-2">80</th>
                  <th className="text-right py-1 px-2">60</th><th className="text-right py-1 px-2">40</th>
                  <th className="text-right py-1 px-2">20</th><th className="text-right py-1 px-2">1</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-green-300">1試合の疲労</td>
                    <td className="text-right px-2 text-green-400">7</td><td className="text-right px-2">9</td>
                    <td className="text-right px-2">10</td><td className="text-right px-2">12</td>
                    <td className="text-right px-2">13</td><td className="text-right px-2 text-red-400">15</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="死球は打席数に関わらず疲労が乗る">
            当てられた痛みは<b className="text-yellow-300">故障ではなく疲労で表現される</b>。
            代打の1打席で当たっても乗る（通常の野手疲労は3打席以上が条件だが、死球は別枠）。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">投手の球速＼体力</th>
                  <th className="text-right py-1 px-2">30</th><th className="text-right py-1 px-2">50</th>
                  <th className="text-right py-1 px-2">70</th><th className="text-right py-1 px-2">90</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">125km/h</td><td className="text-right px-2">14</td><td className="text-right px-2">12</td><td className="text-right px-2">11</td><td className="text-right px-2">9</td></tr>
                  <tr><td className="py-0.5 px-2">140km/h</td><td className="text-right px-2">18</td><td className="text-right px-2">16</td><td className="text-right px-2">14</td><td className="text-right px-2">12</td></tr>
                  <tr><td className="py-0.5 px-2">160km/h</td><td className="text-right px-2 text-red-400">24</td><td className="text-right px-2">21</td><td className="text-right px-2">18</td><td className="text-right px-2">16</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">スタメン1試合ぶんが7〜15なので、<b>1球で1.5〜2.5試合ぶん</b>。数日は本調子でなくなる。</p>
          </Entry>

          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1 mt-4">スタミナ（stamina）</h3>
          <Entry title="スタミナとは" range="30〜150">
            投手専用の能力。1試合内で投げ続けられる体力を表す。投球するたびに1ずつ減少し、イニング間に3回復する。
          </Entry>
          <Entry title="疲労によるスタミナ低下">
            試合開始時のスタミナは、蓄積した疲労の分だけ最大値から差し引かれる（最低でも最大値の50%は確保）。
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              開始スタミナ = max(最大スタミナ × 0.5, 最大スタミナ - 疲労値)
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
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
                <thead><tr className="text-gray-300 border-b border-gray-600">
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
            投手の疲労も<b className="text-yellow-300">体力（bodyStamina）で割る</b>ので、体力が高いほど溜まりにくい。
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              先発 = 球数 ÷ (1.5 + 体力/100 × 1.5) + 30　　リリーフ = max(11, 球数 ÷ (3 + 体力/100 × 1.5))
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">例</th>
                  <th className="text-right py-1 px-2">体力40</th><th className="text-right py-1 px-2">体力70</th>
                  <th className="text-right py-1 px-2">体力100</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-blue-300">先発100球</td><td className="text-right px-2 text-red-400">+77</td><td className="text-right px-2">+69</td><td className="text-right px-2 text-green-400">+63</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">リリーフ20球</td><td className="text-right px-2">+11</td><td className="text-right px-2">+11</td><td className="text-right px-2">+11</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">リリーフ45球</td><td className="text-right px-2">+12</td><td className="text-right px-2">+11</td><td className="text-right px-2">+11</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>先発は<b>1イニング以上投げると一律+30</b>（登板そのものの負荷）。1回持たずに降板した場合は付かない</li>
              <li>リリーフには<b>下限11</b>があり、球数が少なくても連投すれば溜まる</li>
              <li>代打（1〜2打席）や守備固めでは疲労は蓄積しない（ただし回復もしない）</li>
            </ul>
          </Entry>
          <Entry title="疲労による能力低下">
            疲労は打者・投手の両方に影響する。ペナルティは二次曲線で増加し、疲労が高いほど加速度的に悪化する。
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              能力低下 = 疲労² ÷ 670（小数点以下四捨五入）
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
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
            <b className="text-yellow-300">その日に出場した選手は回復しない。</b>疲労が抜けるのは休養日だけ。
            回復量の式は野手と投手で違う。
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              野手 = 体力 × (0.25 + 回復力/100 × 0.60)　　投手 = 20 × (0.7 + 回復力/100 × 0.6)
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">回復力</th>
                  <th className="text-right py-1 px-2">20</th><th className="text-right py-1 px-2">40</th>
                  <th className="text-right py-1 px-2">50</th><th className="text-right py-1 px-2">70</th>
                  <th className="text-right py-1 px-2">90</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">野手（体力50）</td>
                    <td className="text-right px-2">19</td><td className="text-right px-2">25</td>
                    <td className="text-right px-2">28</td><td className="text-right px-2">34</td>
                    <td className="text-right px-2">40</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">野手（体力80）</td>
                    <td className="text-right px-2">30</td><td className="text-right px-2">39</td>
                    <td className="text-right px-2">44</td><td className="text-right px-2">54</td>
                    <td className="text-right px-2">63</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">投手</td>
                    <td className="text-right px-2">16</td><td className="text-right px-2">19</td>
                    <td className="text-right px-2">20</td><td className="text-right px-2">22</td>
                    <td className="text-right px-2">25</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              <b>野手の回復は体力にも比例する</b>ので、体力の高い選手は「溜まりにくく、抜けやすい」の二重に得をする。
              スタッフの体調管理能力でさらに最大+20%。
            </p>
          </Entry>
          <Entry title="運用のポイント">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>先発投手は100球で疲労+63〜77。回復力50なら完全回復に<b>3〜4日</b>必要（＝中4日〜5日のローテ）</li>
              <li>野手は1試合+7〜15に対して休養日1日で+19〜63回復するので、<b>週に1日休めればほぼ抜ける</b>。
                  問題は連戦が続く時期で、実測ではシーズン終了時の規定級野手の疲労が中央26・最大69</li>
              <li>疲労が高い投手はスタミナも減った状態で登板するため、早期降板のリスクが高まる</li>
              <li>リリーフは球数が少なくても<b>1登板あたり最低11</b>溜まる。連投には注意</li>
              <li>AI監督は疲労80以上の投手を先発起用しない</li>
              <li className="text-yellow-300">疲労50を超えた状態で出場すると、その選手の<b>成長率が下がる</b>（-0.01/試合）</li>
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
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
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
          <Entry title="オープナー（opener）" range="球数上限: 40球">
            初回〜2回だけを投げて<b>ロングリリーフへ繋ぐ</b>変則起用。
            2イニング（6アウト）を投げた時点で役割完了となり、球数上限40球も併用される。
            相手の上位打線を1巡だけ抑えたいときに使う。
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
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">ロール</th><th className="text-right py-1 px-2">球数上限</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-blue-300">完投型</td><td className="text-right px-2">120球</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">ゲームメーカー</td><td className="text-right px-2">110球</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">勝ち権利交代</td><td className="text-right px-2">100球</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">ショートスターター</td><td className="text-right px-2">65球</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">オープナー</td><td className="text-right px-2">40球</td></tr>
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
                <thead><tr className="text-gray-300 border-b border-gray-600">
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

    case 'pitchCalling':
      return (
        <div className="space-y-4">
          <Entry title="ストライクゾーンは5×5の25マス">
            ストライクゾーンを3×3に区切り、その外側にボールゾーンを1マス回して 5×5＝25マスとして扱う。
            1球ごとに「捕手がどのマスを要求したか」「投手がそこへ投げられたか」が決まる。
            <div className="bg-gray-700/50 rounded-lg p-3 mt-2 font-mono text-xs text-gray-300 leading-5">
              <div>　　　　外角　　　　　　　　内角</div>
              <div>高め　▫　　▫　　▫　　▫　　▫　　← 高めのボール</div>
              <div>　　　▫　┌─┬─┬─┐　▫</div>
              <div>　　　▫　│　│●│　│　▫　　● = ど真ん中</div>
              <div>　　　▫　└─┴─┴─┘　▫</div>
              <div>低め　▫　　▫　　▫　　▫　　▫　　← 低めのボール</div>
            </div>
            <p className="text-sm mt-2 text-gray-400">
              ※ グリッドは<b>打者から見た向き</b>。右打者でも左打者でも「内角」は同じ側の列を指す。
              試合画面の投球コース図は投手から見た向きに直して描かれる。
            </p>
          </Entry>

          <h3 className="text-amber-300 font-bold text-sm border-b border-amber-800 pb-1 mt-6">捕手が決めること</h3>
          <Entry title="1. 狙い（勝負 / 際どく / 誘い）">
            まずカウントに応じて狙いの種類を決める。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>勝負（zone）</b>: ゾーン内。中央の上下左右を狙う
                  （<b className="text-yellow-300">ど真ん中は狙わない</b>——狙うと制球の良い投手ほど失投が増える）</li>
              <li><b>際どく（edge）</b>: ゾーンの四隅</li>
              <li><b>誘い（chase）</b>: ゾーンのすぐ外</li>
            </ul>
            <p className="text-sm mt-1">3ボールでは勝負が66%、2ストライクでは誘いが38%になる。</p>
          </Entry>
          <Entry title="2. その狙いの中でどのマスか（リードが効く）">
            <b className="text-yellow-300">同じ狙いの中での選び直しなので、ボールになる確率は変わらない</b>——
            つまり四球のコストなしに打者の弱点を突ける。捕手のリードが高いほど、
            打者の苦手なマスを選ぶ確率が上がる。リード0なら完全にランダム。
          </Entry>
          <Entry title="3. 場面ごとの目的">
            走者と アウトカウントで欲しい結果が変わる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">場面</th><th className="text-left py-1 px-2">目的</th>
                  <th className="text-left py-1 px-2">要求</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">一塁に走者・2アウト未満</td><td className="px-2 text-green-300">併殺狙い</td><td className="px-2">低め＋ゴロ系の球種＋ゾーンで勝負</td></tr>
                  <tr><td className="py-0.5 px-2">三塁に走者・2アウト未満</td><td className="px-2 text-blue-300">三振狙い</td><td className="px-2">速球=高め / 変化球=低め＋誘い球増</td></tr>
                  <tr><td className="py-0.5 px-2">満塁・0アウト</td><td className="px-2 text-blue-300">三振狙い</td><td className="px-2">同上だが<b>誘い球を減らしてゾーンへ</b></td></tr>
                  <tr><td className="py-0.5 px-2">2アウト</td><td className="px-2">通常</td><td className="px-2">併殺も犠飛も関係ない</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              三塁に走者でも、一塁が埋まっていて1アウトなら併殺狙いに戻る（併殺でチェンジ）。
              3ボールでは場面補正を掛けない（押し出し回避が最優先）。
            </p>
          </Entry>
          <Entry title="4. 前の球との関係（配球の3次元）">
            実際の配球は「内角高め→外角低め」のように動かす。<b>左右・高低・奥行き（球速差）</b>の
            3次元で前球からどれだけ動いたかが効く。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>対角へ動かすほど打ちにくい（内角高め→外角低めが最大）</li>
              <li><b className="text-yellow-300">ただし毎回対角に振り切るのも損</b>——
                  直近4球で同じ引き出しを使うと打者に読まれる。
                  実測でも「対角を使わない」「対角を最大化する」の両方が中間に負ける</li>
              <li>制球が低い投手は狙いが洗い流されるので、配球の妙は<b>投げ切れる投手にだけ効く</b></li>
            </ul>
          </Entry>

          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">捕手の3つの仕事</h3>
          <Entry title="リード・守備・肩がそれぞれ別の稼ぎ方をする">
            捕手1人でこれだけ違う。実在する能力の幅で測った値。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">能力</th><th className="text-right py-1 px-2">防御率</th>
                  <th className="text-right py-1 px-2">9回四球</th><th className="text-right py-1 px-2">9回三振</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-yellow-300">リード 18→81</td><td className="text-right px-2 text-green-400">-0.28</td><td className="text-right px-2">±0</td><td className="text-right px-2 text-green-400">+0.57</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-300">守備 30→75</td><td className="text-right px-2 text-green-400">-0.19</td><td className="text-right px-2 text-green-400">-0.27</td><td className="text-right px-2">+0.09</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-300">肩 20→80</td><td className="text-right px-2">-0.02</td><td className="text-right px-2">±0</td><td className="text-right px-2">+0.08</td></tr>
                  <tr className="border-t border-gray-600"><td className="py-0.5 px-2 font-bold">三拍子そろった捕手</td><td className="text-right px-2 text-green-400 font-bold">-0.50</td><td className="text-right px-2 text-green-400 font-bold">-0.40</td><td className="text-right px-2 text-green-400 font-bold">+0.50</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li><b>リードは三振と被安打で稼ぐ</b>。四球のコストはゼロ</li>
              <li><b>守備（フレーミング）は四球で稼ぐ</b>。際どい球をストライクにする。
                  <b className="text-yellow-300">ノーコン投手ほど良い捕手を付ける価値が大きい</b>
                  （制球40なら防御率-0.53、制球80なら-0.17）</li>
              <li><b>肩は盗塁を刺す</b>（肩20→80で 0.74→0.45個/試合）が、
                  盗塁1つの得点価値が小さいので防御率にはほとんど出ない</li>
              <li>実在する捕手のリードは18〜81（中央46）。90は事実上存在しない</li>
            </ul>
          </Entry>
          <Entry title="采配モードでの操作">
            守備中は<b>「配球」（球種）</b>と<b>「狙い」（勝負/際どく/誘い）</b>を自分で指示できる。
            どちらも「おまかせ」なら捕手AIが決める。
          </Entry>
        </div>
      );

    case 'batterRead':
      return (
        <div className="space-y-4">
          <Entry title="打者にはコースの得手不得手がある">
            選手ごとに<b>内角の苦手さ・低めの苦手さ・ど真ん中の苦手さ</b>の3つを持ち、
            そこから25マスぶんの補正が決まる。選手詳細の能力タブに
            <b className="text-yellow-300">5×5のヒートマップ</b>（赤=得意 / 青=苦手）で表示される。
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>得意コースでは実効ミート+13・パワー+10、苦手コースではその逆</li>
              <li><b>打者は得意コースをより振る</b>（スイング率 得意52.8% 対 苦手41.6%）</li>
              <li>「ど真ん中の苦手さ」は<b>失投を仕留める能力</b>そのもの。
                  同じ能力値でも本塁打率が4倍違う</li>
              <li>四隅が苦手な打者が多数派。「隅は誰でも苦手」が既定になっている</li>
            </ul>
          </Entry>
          <Entry title="詰まる打者・泳ぐ打者">
            コース適性の一部は<b>ミートとパワーのバランス</b>から決まる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">打者</th><th className="text-left py-1 px-2">弱点</th>
                  <th className="text-left py-1 px-2">攻め方</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">パワーの無い技巧派</td><td className="px-2 text-red-300">内角で<b>詰まる</b></td><td className="px-2">内角を突く</td></tr>
                  <tr><td className="py-0.5 px-2">ミートの無い長距離砲</td><td className="px-2 text-red-300">外角で<b>泳ぐ</b></td><td className="px-2">外角へ逃がす</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              長距離砲を外角に逃がす効果は絶大（塁打/打球 0.728→0.417、本塁打率 9.2%→2.0%）。
            </p>
          </Entry>

          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1 mt-6">打者の4分類（野村克也の分類）</h3>
          <Entry title="型は選ぶものではなく能力から決まる">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">型</th><th className="text-left py-1 px-2">張るもの</th>
                  <th className="text-left py-1 px-2">条件</th><th className="text-right py-1 px-2">割合</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-pink-300 font-bold">A型 直球対応</td><td className="px-2">直球（変化球にも対応）</td><td className="px-2">ミート66以上</td><td className="text-right px-2">16%</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300 font-bold">B型 コース狙い</td><td className="px-2">得意な側の縦列</td><td className="px-2">選球眼が強み</td><td className="text-right px-2">32%</td></tr>
                  <tr><td className="py-0.5 px-2 text-orange-300 font-bold">C型 方向決め</td><td className="px-2">引っ張り／流し</td><td className="px-2">パワーが強み</td><td className="text-right px-2">24%</td></tr>
                  <tr><td className="py-0.5 px-2 text-gray-300 font-bold">D型 ヤマ張り</td><td className="px-2">球種</td><td className="px-2">どれも平凡</td><td className="text-right px-2">27%</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li><b>A型だけ「外し」がない</b>のが理想型の定義。三振が2.1pt減る</li>
              <li><b>B型は逆のコースを見送る</b>ので四球で稼ぐ（出塁率+.011）</li>
              <li><b>C型は打球方向が寄る</b>（±9度）ので本塁打が増える</li>
              <li>B型・C型は<b>打席の頭でどちら側を待つか決める</b>。選球眼が高いほど読み当てる</li>
              <li>型は選手詳細のコース適性の上にバッジで表示される</li>
            </ul>
          </Entry>
          <Entry title="AI打者もヤマを張る">
            張って当たればタイミングが大きく広がるが、<b className="text-yellow-300">外せば代償がある</b>。
            これがあるから「良い捕手は読み違えさせられる」。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>張る確率はカウント次第（打者有利40% / 平行25% / 投手有利15% / 2ストライク8%）</li>
              <li>リード0の捕手が相手だと打者の的中は36.5%、リード100なら11.6%まで落ちる</li>
            </ul>
          </Entry>

          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">振り方（フルスイング / 当てにいく）</h3>
          <Entry title="1球ごとに振り方が変わる">
            効果は<b>ミート -8 / パワー +10</b>（フルスイング側）。当てにいくとその逆。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">場面</th>
                  <th className="text-right py-1 px-2">フルスイング</th><th className="text-right py-1 px-2">通常</th>
                  <th className="text-right py-1 px-2">当てにいく</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">得意コース</td><td className="text-right px-2 text-orange-300">58.9%</td><td className="text-right px-2">35.4%</td><td className="text-right px-2">5.7%</td></tr>
                  <tr><td className="py-0.5 px-2">苦手コース</td><td className="text-right px-2">5.9%</td><td className="text-right px-2">41.3%</td><td className="text-right px-2 text-blue-300">52.8%</td></tr>
                  <tr><td className="py-0.5 px-2">2ストライク</td><td className="text-right px-2">4.0%</td><td className="text-right px-2">34.6%</td><td className="text-right px-2 text-blue-300">61.4%</td></tr>
                  <tr><td className="py-0.5 px-2">前球で崩された</td><td className="text-right px-2">7.3%</td><td className="text-right px-2">32.9%</td><td className="text-right px-2 text-blue-300">59.8%</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              <b className="text-yellow-300">一辺倒はどちらも損。</b>常にフルスイングだと打率-0.008、
              常に当てにいくと-0.007。場面で決める現行が最善になる。
            </p>
          </Entry>
          <Entry title="崩された打者はゾーンが広がる">
            泳がされた次の球では、枠のすぐ外のボール球に手を出しやすくなる
            （スイング率 34.7% → 40.7%）。<b>崩した直後に誘い球がよく効く</b>という畳み掛けが成立する。
          </Entry>
          <Entry title="パワー80の打者が常にパワー80ではない">
            コース適性・振り方・投球位置の質を合算した「1球ごとの実効パワー」は大きく振れる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">素のパワー</th>
                  <th className="text-right py-1 px-2">下位5%</th><th className="text-right py-1 px-2">中央</th>
                  <th className="text-right py-1 px-2">上位5%</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">50</td><td className="text-right px-2">28</td><td className="text-right px-2">48</td><td className="text-right px-2">60</td></tr>
                  <tr><td className="py-0.5 px-2">80</td><td className="text-right px-2 text-blue-300">54</td><td className="text-right px-2">78</td><td className="text-right px-2 text-orange-300">92</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="采配モードでの操作">
            攻撃中は<b>狙い球（直球/変化球）</b>と<b>コース（内角/外角/高め/低め）</b>を張れる。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>当たれば有利／外すと不利。<b>当てずっぽうに張ると損をする</b></li>
              <li>真ん中に来た球は中立（当たりでも外れでもない）</li>
              <li>材料は揃っている——試合画面のコース図（この打席どこに来ているか）と
                  選手詳細のヒートマップ（自分の弱点＝捕手が狙ってくる場所）</li>
            </ul>
          </Entry>
        </div>
      );

    case 'ballTypes':
      return (
        <div className="space-y-4">
          <Entry title="球種には3つの性格がある">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b className="text-blue-300">空振り</b>（whiff）: タイミングを外す</li>
              <li><b className="text-green-300">ゴロ</b>（groundball）: 打球の角度を下げる</li>
              <li><b className="text-orange-300">凡打</b>（weak）: 打球の初速を落とす</li>
            </ul>
            <p className="text-sm mt-2">
              <b className="text-yellow-300">「何を持っているか」で防御率が0.40〜0.84動く。</b>
            </p>
          </Entry>
          <Entry title="球種ごとの実測（ストレート＋1球種Lv50）">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">持ち球</th><th className="text-right py-1 px-2">防御率差</th>
                  <th className="text-right py-1 px-2">三振率</th><th className="text-right py-1 px-2">ゴロ率</th>
                  <th className="text-right py-1 px-2">9回四球</th><th className="text-left py-1 px-2">性格</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">ストレートのみ</td><td className="text-right px-2">—</td><td className="text-right px-2">16.0%</td><td className="text-right px-2">43.5%</td><td className="text-right px-2">3.56</td><td className="px-2">—</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-400">カーブ</td><td className="text-right px-2 text-green-400">-0.84</td><td className="text-right px-2">20.4%</td><td className="text-right px-2">46.7%</td><td className="text-right px-2">3.78</td><td className="px-2">緩急</td></tr>
                  <tr><td className="py-0.5 px-2">ナックル</td><td className="text-right px-2">-0.72</td><td className="text-right px-2">20.4%</td><td className="text-right px-2">46.0%</td><td className="text-right px-2 text-red-400">4.29</td><td className="px-2">空振りだが決まらない</td></tr>
                  <tr><td className="py-0.5 px-2">チェンジアップ</td><td className="text-right px-2">-0.71</td><td className="text-right px-2">20.2%</td><td className="text-right px-2">47.5%</td><td className="text-right px-2">3.75</td><td className="px-2">緩急＋ゴロ</td></tr>
                  <tr><td className="py-0.5 px-2">シンカー</td><td className="text-right px-2">-0.70</td><td className="text-right px-2">19.0%</td><td className="text-right px-2 text-green-400">47.4%</td><td className="text-right px-2">3.67</td><td className="px-2">ゴロ＋凡打の両方</td></tr>
                  <tr><td className="py-0.5 px-2">フォーク</td><td className="text-right px-2">-0.70</td><td className="text-right px-2">20.2%</td><td className="text-right px-2">46.3%</td><td className="text-right px-2">4.03</td><td className="px-2">空振り</td></tr>
                  <tr><td className="py-0.5 px-2">スライダー</td><td className="text-right px-2">-0.67</td><td className="text-right px-2">19.9%</td><td className="text-right px-2">46.1%</td><td className="text-right px-2">3.74</td><td className="px-2">空振り</td></tr>
                  <tr><td className="py-0.5 px-2">シュート / カッター</td><td className="text-right px-2">-0.49</td><td className="text-right px-2">18.7%</td><td className="text-right px-2 text-green-400">47.9%</td><td className="text-right px-2">3.86</td><td className="px-2">詰まらせる</td></tr>
                  <tr><td className="py-0.5 px-2">ツーシーム</td><td className="text-right px-2">-0.40</td><td className="text-right px-2">18.4%</td><td className="text-right px-2">47.4%</td><td className="text-right px-2">3.87</td><td className="px-2">詰まらせる</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">上位（カーブ〜スライダー）は<b>三振</b>で、下位（シュート〜ツーシーム）は<b>ゴロ</b>で抑える。</p>
          </Entry>

          <h3 className="text-yellow-300 font-bold text-sm border-b border-yellow-800 pb-1 mt-6">習熟度（レベル）</h3>
          <Entry title="未熟な変化球は決まらない">
            <b className="text-yellow-300">「とりあえず覚える」は通用しない。</b>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">スライダーの習熟度</th>
                  <th className="text-right py-1 px-2">防御率差</th><th className="text-right py-1 px-2">三振率</th>
                  <th className="text-right py-1 px-2">9回四球</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">（持たない）</td><td className="text-right px-2">—</td><td className="text-right px-2">16.8%</td><td className="text-right px-2">3.58</td></tr>
                  <tr><td className="py-0.5 px-2 text-red-400">Lv10</td><td className="text-right px-2 text-red-400">-0.11（誤差）</td><td className="text-right px-2">18.5%</td><td className="text-right px-2 text-red-400">4.48</td></tr>
                  <tr><td className="py-0.5 px-2">Lv30</td><td className="text-right px-2">-0.47</td><td className="text-right px-2">19.7%</td><td className="text-right px-2">4.03</td></tr>
                  <tr><td className="py-0.5 px-2">Lv50</td><td className="text-right px-2">-0.69</td><td className="text-right px-2">20.8%</td><td className="text-right px-2">3.77</td></tr>
                  <tr><td className="py-0.5 px-2">Lv70</td><td className="text-right px-2">-0.81</td><td className="text-right px-2">22.2%</td><td className="text-right px-2">3.49</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-400">Lv90</td><td className="text-right px-2 text-green-400">-0.99</td><td className="text-right px-2">23.4%</td><td className="text-right px-2 text-green-400">3.14</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              <b>Lv10は「防御率はほぼ変わらず四球だけ +0.9 増える」＝覚えたてはむしろ損。</b>
              Lv20〜30から明確に得になる。
              <b className="text-yellow-300">Lv100はどの球種でもLv55を上回る</b>ので、
              球種の性格が効くのは同じレベルで比べたときの話。
            </p>
          </Entry>

          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1 mt-6">持ち球の「幅」</h3>
          <Entry title="何本持っているかより、何を持っているか">
            似た球を並べても引き出しは増えない。球種を「奥行き・横・縦」の3軸に置いて、
            近い球どうしは互いを打ち消す。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">ストレート＋2球種（Lv60）</th>
                  <th className="text-right py-1 px-2">実効の持ち球数</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">スライダー＋シュート（左右が反対）</td><td className="text-right px-2 text-green-400">2.64</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">カーブ＋シュート（遅球と横）</td><td className="text-right px-2 text-green-400">2.64</td></tr>
                  <tr><td className="py-0.5 px-2">スライダー＋フォーク（横と縦）</td><td className="text-right px-2">2.41</td></tr>
                  <tr><td className="py-0.5 px-2">フォーク＋カーブ</td><td className="text-right px-2">2.04</td></tr>
                  <tr><td className="py-0.5 px-2 text-red-300">スライダー＋カッター（似ている）</td><td className="text-right px-2 text-red-400">1.83</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              実測でスライダー＋カッターはスライダー＋シュートより<b>防御率が0.14悪い</b>。
              反対の性格を組み合わせるほど読まれにくい。
            </p>
          </Entry>
          <Entry title="変化球の封印">
            覚えている球でも<b>試合では使わない</b>という選択ができる。
            スタメン設定 → 投手起用の選手詳細で、変化球バッジをクリックして封印／解禁する。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>封印しても<b>練習・成長・表示からは消えない</b>。試合で投げないだけ</li>
              <li>打者の読み合いからも外れるので、<b>読まれやすくなる代償</b>がある</li>
              <li>実測: 未熟な球（Lv10）の封印は<b>防御率+0.16と引き換えに四球-0.84</b>。
                  「四球を出せない場面の投手は封印しておく」が意味を持つ</li>
              <li>全部は封印できない（投げる球が無くなる）</li>
            </ul>
          </Entry>
          <Entry title="ナックルは読み合いが成立しない">
            回転を殺して不規則に揺れる球で、投手・捕手・打者の誰にもどこへ来るか分からない。
            <b className="text-yellow-300">球種を張り当てても効果が出ない</b>。
            そのぶん四球が増える代償があり、1球種のナックルボーラーが専門職として成立する。
          </Entry>
          <Entry title="曲がりの効きは130km/h付近が頂点">
            物理的には遅いほど曲がるが、遅すぎると打者に見極める時間ができる。
            打者にとっての実効的な効きは中間で頂点になる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">到達球速</th>
                  <th className="text-right py-1 px-2">80</th><th className="text-right py-1 px-2">110</th>
                  <th className="text-right py-1 px-2">130</th><th className="text-right py-1 px-2">150</th>
                  <th className="text-right py-1 px-2">170</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">効き</td>
                    <td className="text-right px-2 text-red-400">0.60</td><td className="text-right px-2">1.09</td>
                    <td className="text-right px-2 text-green-400">1.18</td><td className="text-right px-2">1.09</td>
                    <td className="text-right px-2">0.81</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
        </div>
      );

    case 'battedBall':
      return (
        <div className="space-y-4">
          <Entry title="打球の種類ごとに安打率が桁違いに違う">
            <b className="text-yellow-300">ライナーが最も安打になる打球</b>で、ゴロの3倍近い。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">打球</th><th className="text-right py-1 px-2">発生率</th>
                  <th className="text-right py-1 px-2">安打率</th><th className="text-right py-1 px-2">実データ</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">ゴロ</td><td className="text-right px-2">42%</td><td className="text-right px-2">.235</td><td className="text-right px-2 text-gray-400">.240</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-400">ライナー</td><td className="text-right px-2">20%</td><td className="text-right px-2 text-green-400">.644</td><td className="text-right px-2 text-gray-400">.660</td></tr>
                  <tr><td className="py-0.5 px-2">フライ（本塁打込）</td><td className="text-right px-2">31%</td><td className="text-right px-2">.229</td><td className="text-right px-2 text-gray-400">.210</td></tr>
                  <tr><td className="py-0.5 px-2">ポップフライ</td><td className="text-right px-2">7%</td><td className="text-right px-2 text-red-400">.019</td><td className="text-right px-2 text-gray-400">.020</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="投球コースが打球を決める">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">来た球</th><th className="text-right py-1 px-2">引っ張り</th>
                  <th className="text-right py-1 px-2">センター</th><th className="text-right py-1 px-2">流し</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-orange-300">内角</td><td className="text-right px-2 text-orange-300">53.8%</td><td className="text-right px-2">38.6%</td><td className="text-right px-2">7.6%</td></tr>
                  <tr><td className="py-0.5 px-2">真ん中</td><td className="text-right px-2">36.4%</td><td className="text-right px-2">50.9%</td><td className="text-right px-2">12.7%</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">外角</td><td className="text-right px-2">24.3%</td><td className="text-right px-2">51.4%</td><td className="text-right px-2 text-blue-300">24.3%</td></tr>
                </tbody>
              </table>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">高さ</th><th className="text-right py-1 px-2">ゴロ率</th>
                  <th className="text-right py-1 px-2">フライ率</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">高め</td><td className="text-right px-2">35.1%</td><td className="text-right px-2 text-orange-300">40.9%</td></tr>
                  <tr><td className="py-0.5 px-2">真ん中</td><td className="text-right px-2">46.4%</td><td className="text-right px-2">33.6%</td></tr>
                  <tr><td className="py-0.5 px-2">低め</td><td className="text-right px-2 text-green-300">56.8%</td><td className="text-right px-2">25.2%</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              速球→遅球の<b>緩急</b>も方向に効く（引っ張り率 45.4% 対 遅球→速球の 30.5%）。
            </p>
          </Entry>

          <h3 className="text-red-300 font-bold text-sm border-b border-red-800 pb-1 mt-6">失策</h3>
          <Entry title="守備力60が「プロの及第点」">
            60を基準に、下回るほど急激に、上回るほど緩やかに変化する。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">守備力</th>
                  <th className="text-right py-1 px-2">20</th><th className="text-right py-1 px-2">30</th>
                  <th className="text-right py-1 px-2">40</th><th className="text-right py-1 px-2">50</th>
                  <th className="text-right py-1 px-2">60</th><th className="text-right py-1 px-2">70</th>
                  <th className="text-right py-1 px-2">80</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-red-300">1機会あたり失策率</td>
                    <td className="text-right px-2 text-red-400">12.2%</td><td className="text-right px-2">9.6%</td>
                    <td className="text-right px-2">7.0%</td><td className="text-right px-2">4.4%</td>
                    <td className="text-right px-2 text-yellow-300">1.8%</td><td className="text-right px-2">1.2%</td>
                    <td className="text-right px-2 text-green-400">0.6%</td></tr>
                  <tr><td className="py-0.5 px-2">1試合の失策（両チーム計）</td>
                    <td className="text-right px-2">—</td><td className="text-right px-2">—</td>
                    <td className="text-right px-2">3.42</td><td className="text-right px-2">2.13</td>
                    <td className="text-right px-2">1.02</td><td className="text-right px-2">—</td>
                    <td className="text-right px-2">0.48</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              能力値の物差し: <b>20=小学生 / 30=中学生 / 40=高校生 / 50=大学生 / 60=プロの及第点</b>。
            </p>
          </Entry>
          <Entry title="送球エラーは「送り手の肩＋受け手の守備」">
            捕球ミスとは独立した判定。悪送球・中継ミスは走者が<b>余分に1つ進塁</b>する。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>一塁への悪送球（一塁手の守備が受け手）</li>
              <li>外野からの中継ミス（遊撃・二塁がカットマン）</li>
              <li>盗塁阻止の捕手悪送球（二塁・三塁のカバーが受け手）</li>
              <li>肩60・受け手60で約1.2%、肩40・受け手40で約4.6%</li>
            </ul>
          </Entry>
          <Entry title="自責点は失策絡みを除外する">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>失策で出塁した走者の生還は非自責</li>
              <li>失策が無ければ3アウトだった後の得点は非自責</li>
              <li>守備40のチームは防御率4.69に対して失点率3.62、
                  守備60なら2.73に対して2.48と差が縮まる</li>
            </ul>
          </Entry>

          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">走者の進塁と捕殺</h3>
          <Entry title="強肩の外野手は走者を自重させる">
            単打での積極進塁（1塁→3塁 / 2塁→本塁）は、走者の足と<b>実際に打球を処理した野手の肩</b>で決まる。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>試行率: 2塁→本塁55% / 1塁→3塁22%（走力で増、外野の肩で減）</li>
              <li>狙って失敗すれば刺殺（捕殺）。成功率は肩60・カット60・走力55で約22%</li>
              <li><b className="text-yellow-300">強肩ほど捕殺数は伸びない</b>——走者が自重するため。
                  ただし失点は明確に減る（肩40→7.0失点/試合、肩80→6.2）</li>
            </ul>
          </Entry>
          <Entry title="内野ゴロでも走者は動く">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>三塁走者の生還（ゴロGO）約50%、二塁走者の三塁進塁（進塁打）約50%。内野の守備力で増減</li>
              <li><b>2アウトの走者が最も積極的</b>（打球を確認せずスタートを切るため）。
                  単打での2塁走者生還は0アウト約5割 → 2アウト約8.5割</li>
              <li>二塁打でも1塁走者の約45%が生還する</li>
            </ul>
          </Entry>
          <Entry title="併殺">
            一塁に走者・2アウト未満・内野ゴロのアウトが条件。
            内野の守備力が高いほど、走者の足が遅いほど成立しやすい（守備50・足55で34%）。
            <p className="text-sm mt-1 text-gray-400">
              ※ 現状の併殺は0.65個/試合。実NPBの約0.70に近い水準。
            </p>
          </Entry>

          <h3 className="text-orange-300 font-bold text-sm border-b border-orange-800 pb-1 mt-6">球場と長打</h3>
          <Entry title="フェンスまでの距離">
            ポール際96m / 中間112m / センター119m。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>フェンスを越える飛距離があり打出し角20〜45度なら原則そのまま本塁打</b>。
                  塀際の好捕で稀に阻まれる（余裕5m未満で最大22%）</li>
              <li>引っ張った打球はフェンスが近いので、<b>詰まっても本塁打だけは増える</b></li>
              <li>公認球の差を吸収する係数があり、MLB基準の飛距離式のまま
                  NPB相当の本塁打数（0.55〜0.75本/試合）になる</li>
            </ul>
          </Entry>
          <Entry title="盗塁">
            走力・盗塁スキル・捕手の肩・投手のクイック・左投手の牽制で決まる。
            実測で0.4〜0.6個/試合・成功率73〜77%（実NPB 0.55個・72〜75%）。
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
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">結果</th>
                  <th className="text-right py-1 px-2">確率</th>
                  <th className="text-right py-1 px-2">初期レベル</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-purple-300">覚醒</td><td className="text-right px-2">10%</td><td className="text-right px-2 text-purple-400">Lv61〜80</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-300">大成功</td><td className="text-right px-2">15%</td><td className="text-right px-2 text-green-400">Lv41〜60</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">成功</td><td className="text-right px-2">20%</td><td className="text-right px-2">Lv21〜40</td></tr>
                  <tr><td className="py-0.5 px-2 text-gray-300">習得</td><td className="text-right px-2">25%</td><td className="text-right px-2">Lv1〜20</td></tr>
                  <tr><td className="py-0.5 px-2 text-red-400">失敗</td><td className="text-right px-2">30%</td><td className="text-right px-2 text-gray-400">習得不可</td></tr>
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
                <thead><tr className="text-gray-300 border-b border-gray-600">
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
          <Entry title="フィジカル系（走力・肩力・スタミナ・体力・回復）">
            若いほど大きく成長し、20歳以下がピーク。<b>26歳から衰えに入り、30代の落ち方は技術系より急</b>。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">年齢</th>
                  <th className="text-right py-1 px-2">〜20</th><th className="text-right py-1 px-2">〜22</th>
                  <th className="text-right py-1 px-2">〜24</th><th className="text-right py-1 px-2">25</th>
                  <th className="text-right py-1 px-2">〜28</th><th className="text-right py-1 px-2">〜31</th>
                  <th className="text-right py-1 px-2">〜34</th><th className="text-right py-1 px-2">35+</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-green-300">成長補正</td>
                    <td className="text-right px-2 text-green-400">+0.8</td>
                    <td className="text-right px-2 text-green-400">+0.6</td>
                    <td className="text-right px-2 text-green-400">+0.3</td>
                    <td className="text-right px-2 text-yellow-300">0.0</td>
                    <td className="text-right px-2 text-red-400">-0.5</td>
                    <td className="text-right px-2 text-red-400">-1.2</td>
                    <td className="text-right px-2 text-red-400">-2.5</td>
                    <td className="text-right px-2 text-red-400">-4.0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="技術系（ミート・パワー・選球眼・制球・守備・盗塁）">
            22〜24歳がピーク。フィジカル系より落ち方が緩やかで、<b>30代でも技術は残る</b>。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">年齢</th>
                  <th className="text-right py-1 px-2">〜21</th><th className="text-right py-1 px-2">〜24</th>
                  <th className="text-right py-1 px-2">25</th><th className="text-right py-1 px-2">〜28</th>
                  <th className="text-right py-1 px-2">〜31</th><th className="text-right py-1 px-2">〜34</th>
                  <th className="text-right py-1 px-2">35+</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td className="py-0.5 px-2 text-green-300">成長補正</td>
                    <td className="text-right px-2 text-green-400">+0.3</td>
                    <td className="text-right px-2 text-green-400">+0.9</td>
                    <td className="text-right px-2 text-yellow-300">0.0</td>
                    <td className="text-right px-2 text-red-400">-0.4</td>
                    <td className="text-right px-2 text-red-400">-0.8</td>
                    <td className="text-right px-2 text-red-400">-1.8</td>
                    <td className="text-right px-2 text-red-400">-3.0</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2 text-gray-400">
              ※ この表はキャンプ練習の下敷きになる補正。シーズンをまたぐ年次成長は
              能力ごとにピーク年齢が違う（走力23歳 / 肩25歳 / パワー29歳 / 選球眼29歳…）。
              「年次成長」のページを参照。
            </p>
          </Entry>
          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">成長減衰</h3>
          <Entry title="伸びるほど伸びにくくなる">
            高い能力ほど1ポイントの上積みが難しくなる。<b className="text-yellow-300">技術系とフィジカル系で閾値が違う</b>。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">系統</th>
                  <th className="text-right py-1 px-2">減衰開始</th>
                  <th className="text-right py-1 px-2">1ポイントあたり</th>
                  <th className="text-right py-1 px-2">下限</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-yellow-300">技術系（ミート・パワー・選球眼・制球・守備・盗塁）</td>
                    <td className="text-right px-2 text-yellow-300">75</td><td className="text-right px-2">-4%</td><td className="text-right px-2">15%</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">フィジカル系（走力・肩・スタミナ・体力・回復）</td>
                    <td className="text-right px-2">80</td><td className="text-right px-2">-3%</td><td className="text-right px-2">10%</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">球速</td>
                    <td className="text-right px-2">155km/h</td><td className="text-right px-2 text-red-400">-20%</td><td className="text-right px-2">10%</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>技術系は85で60%、95で15%（下限）まで落ちる</li>
              <li>球速は156km/hで80%、157km/hで60%…と急激に伸びにくくなる。
                  さらに<b>肩力による上限</b>があり、そちらを超えることはできない</li>
            </ul>
          </Entry>
          <h3 className="text-yellow-300 font-bold text-sm border-b border-yellow-800 pb-1 mt-6">覚醒システム</h3>
          <Entry title="覚醒とは">
            メイン練習中に一定確率で発生する大幅な追加成長（+3〜6）。覚醒分は成長減衰の影響を受けない。
          </Entry>
          <Entry title="覚醒は「経験値 × プロ意識」で決まる">
            <b className="text-yellow-300">経験値だけでは覚醒しない。</b>努力する姿勢がなければ飛躍は起きない。
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              覚醒率 = (経験値 ÷ 15) × プロ意識係数　　※ 経験値30未満は0
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">プロ意識</th>
                  <th className="text-right py-1 px-2">〜29</th><th className="text-right py-1 px-2">40</th>
                  <th className="text-right py-1 px-2">50</th><th className="text-right py-1 px-2">70</th>
                  <th className="text-right py-1 px-2">80以上</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">プロ意識係数</td>
                    <td className="text-right px-2 text-red-400">0（覚醒しない）</td><td className="text-right px-2">0.5</td>
                    <td className="text-right px-2">1.0</td><td className="text-right px-2">2.0</td>
                    <td className="text-right px-2 text-green-400">2.5（上限）</td></tr>
                  <tr><td className="py-0.5 px-2">経験値150の選手の覚醒率</td>
                    <td className="text-right px-2 text-red-400">0%</td><td className="text-right px-2">5%</td>
                    <td className="text-right px-2">10%</td><td className="text-right px-2">20%</td>
                    <td className="text-right px-2 text-green-400">25%</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              プロ意識は選手詳細で<b>「精神」グレード（S〜F）</b>としてぼかして表示される。生の数値は見えない。
            </p>
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
              <li>大学野球留学はチーム全体で4人まで／プロ研修はリーグ全体で合計8人まで</li>
              <li><b>モードによって行ける先が違う</b>——独立リーグは両方、社会人は大学のみ
                  （プロとアマの交わりを避ける）、クラブ・大学は派遣なし</li>
            </ul>
          </Entry>
          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1 mt-4">派遣先</h3>
          <Entry title="🎓 大学野球留学" range="26歳以下 / 総合力60以下">
            OBのいる大学へ派遣。<b className="text-yellow-300">フィジカル系</b>が大幅に伸びる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">対象</th>
                  <th className="text-left py-1 px-2">主な成長能力（標準的な結果の場合）</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-blue-300">投手</td><td className="px-2">スタミナ+10〜24、球速+2〜4、制球+2〜5</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">野手</td><td className="px-2">パワー+8〜17、走力+6〜13、肩力+4〜9、ミート+2〜5</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="🏟️ プロ研修" range="24歳以下 / 総合力55以下">
            キャンプ期間にプロ球団で特訓。<b className="text-yellow-300">技術系</b>が大幅に伸びる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">対象</th>
                  <th className="text-left py-1 px-2">主な成長能力（標準的な結果の場合）</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-blue-300">投手</td><td className="px-2">制球+8〜17、変化球+5〜12、スタミナ+5〜14、球速+1〜3</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">野手</td><td className="px-2">ミート+8〜17、選球眼+6〜13、守備+5〜10、パワー+2〜5</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <h3 className="text-green-300 font-bold text-sm border-b border-green-800 pb-1 mt-6">結果は3段階。失敗はない</h3>
          <Entry title="どの段階になるかはプロ意識で決まる">
            <b className="text-yellow-300">経験値ではなくプロ意識（精神グレード）</b>。
            学ぶ姿勢がなければ、良い環境へ送っても伸びない。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">プロ意識</th>
                  <th className="text-right py-1 px-2">微成長 ×0.5</th>
                  <th className="text-right py-1 px-2">成長 ×1.0</th>
                  <th className="text-right py-1 px-2">飛躍 ×1.5</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">20（精神E〜F）</td><td className="text-right px-2 text-red-400">23%</td><td className="text-right px-2">60%</td><td className="text-right px-2">17%</td></tr>
                  <tr><td className="py-0.5 px-2">50（精神C〜D）</td><td className="text-right px-2">16%</td><td className="text-right px-2">56%</td><td className="text-right px-2">28%</td></tr>
                  <tr><td className="py-0.5 px-2">80（精神A〜B）</td><td className="text-right px-2">8%</td><td className="text-right px-2">54%</td><td className="text-right px-2 text-green-400">38%</td></tr>
                  <tr><td className="py-0.5 px-2">100（精神S）</td><td className="text-right px-2 text-green-400">3%</td><td className="text-right px-2">52%</td><td className="text-right px-2 text-green-400">45%</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <h3 className="text-yellow-300 font-bold text-sm border-b border-yellow-800 pb-1 mt-6">覚醒チャンス</h3>
          <Entry title="派遣中の覚醒">
            派遣でも覚醒が発生する。覚醒時はランダムな能力に追加ボーナス（+3〜6に結果倍率を適用）。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">派遣結果</th>
                  <th className="text-right py-1 px-2">覚醒発生率</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-gray-300">微成長時</td><td className="text-right px-2">10%</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">成長時</td><td className="text-right px-2">20%</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-300">飛躍時</td><td className="text-right px-2">30%</td></tr>
                </tbody>
              </table>
            </div>
          </Entry>
          <Entry title="覚醒の対象能力">
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>投手</b>: 球速または制球のいずれかがランダムで大幅UP。
                  球速が選ばれた場合は<b>肩力による上限</b>を超えない</li>
              <li><b>野手</b>: ミート・パワー・走力のいずれかがランダムで大幅UP</li>
            </ul>
          </Entry>
          <Entry title="球速の成長上限">
            リアリズム維持のため、<b className="text-yellow-300">1回の派遣で球速が伸びるのは最大13km/h</b>まで。
            覚醒を含めた合計がこれを超える場合は切り詰められる。
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

    case 'growth':
      return (
        <div className="space-y-4">
          <Entry title="実成長 = 基礎成長 + 練習成長">
            シーズンをまたぐ年次成長は、次の形で決まる。
            <code className="bg-surface-2 px-2 py-1 rounded text-sm text-green-300 block mt-1">
              実成長 = （基礎成長 ＋ 練習成長 × 環境）× 才能・出場量などの倍率
            </code>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">要素</th><th className="text-left py-1 px-2">何を表すか</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-1 px-2 text-green-300 font-bold">成長率（growthPotential）</td>
                    <td className="px-2"><b>基礎成長</b>。何もしなくても身体が育つ／衰える。年齢でマイナスへ入る</td></tr>
                  <tr><td className="py-1 px-2 text-yellow-300 font-bold">プロ意識（discipline）</td>
                    <td className="px-2"><b>練習成長への乗算</b>。常に0以上</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              基礎がマイナスへ入っても練習成長が上回れば伸び、釣り合えば維持、
              <b className="text-yellow-300">基礎の衰えが練習成長を超えたらプロ意識が高くても衰える</b>。
            </p>
          </Entry>
          <Entry title="衰え始める年齢はプロ意識で決まる">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">プロ意識</th>
                  <th className="text-right py-1 px-2">20</th><th className="text-right py-1 px-2">35</th>
                  <th className="text-right py-1 px-2">50</th><th className="text-right py-1 px-2">65</th>
                  <th className="text-right py-1 px-2">80</th><th className="text-right py-1 px-2">100</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">社会人</td>
                    <td className="text-right px-2 text-red-400">27歳</td><td className="text-right px-2">29</td>
                    <td className="text-right px-2">32</td><td className="text-right px-2">34</td>
                    <td className="text-right px-2">37</td><td className="text-right px-2 text-green-400">40</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">独立</td>
                    <td className="text-right px-2">27歳</td><td className="text-right px-2">31</td>
                    <td className="text-right px-2">34</td><td className="text-right px-2">37</td>
                    <td className="text-right px-2 text-green-400">40</td><td className="text-right px-2">—</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">クラブ</td>
                    <td className="text-right px-2 text-red-400">26歳</td><td className="text-right px-2">27</td>
                    <td className="text-right px-2">29</td><td className="text-right px-2">31</td>
                    <td className="text-right px-2">32</td><td className="text-right px-2">34</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              プロ意識の分布は平均50・σ18。社会人なら下位5%が27歳・中央が32歳・上位3%が38歳で、
              <b>「20代中盤で衰える者」と「30代後半でも活躍する者」が同居する</b>。
            </p>
          </Entry>
          <Entry title="能力ごとにピーク年齢が違う">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">能力</th><th className="text-right py-1 px-2">ピーク</th>
                  <th className="text-left py-1 px-2 pl-6">能力</th><th className="text-right py-1 px-2">ピーク</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">走力</td><td className="text-right px-2">23歳</td>
                      <td className="py-0.5 px-2 pl-6">ミート</td><td className="text-right px-2">27歳</td></tr>
                  <tr><td className="py-0.5 px-2">球速</td><td className="text-right px-2">24歳</td>
                      <td className="py-0.5 px-2 pl-6">守備</td><td className="text-right px-2">27歳</td></tr>
                  <tr><td className="py-0.5 px-2">肩</td><td className="text-right px-2">25歳</td>
                      <td className="py-0.5 px-2 pl-6">パワー</td><td className="text-right px-2">29歳</td></tr>
                  <tr><td className="py-0.5 px-2">スタミナ</td><td className="text-right px-2">27歳</td>
                      <td className="py-0.5 px-2 pl-6 text-yellow-300">選球眼</td><td className="text-right px-2 text-yellow-300">29歳</td></tr>
                  <tr><td className="py-0.5 px-2"></td><td className="text-right px-2"></td>
                      <td className="py-0.5 px-2 pl-6 text-yellow-300">制球</td><td className="text-right px-2 text-yellow-300">31歳</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              <b>走力は20代前半・筋力は20代後半・選球眼と制球は30代まで</b>。
              打者の型が加齢で変わる（若い＝走力型 / 年配＝選球眼型）のもこの副産物。
            </p>
          </Entry>
          <Entry title="衰え方は「体から落ち、技術は残る」">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">ピーク→38歳</th><th className="text-right py-1 px-2">減少率</th>
                  <th className="text-left py-1 px-2 pl-6"></th><th className="text-right py-1 px-2">減少率</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-red-300">走力</td><td className="text-right px-2 text-red-400">-23%</td>
                      <td className="py-0.5 px-2 pl-6">守備</td><td className="text-right px-2">-8%</td></tr>
                  <tr><td className="py-0.5 px-2">スタミナ</td><td className="text-right px-2">-16%</td>
                      <td className="py-0.5 px-2 pl-6">パワー</td><td className="text-right px-2">-8%</td></tr>
                  <tr><td className="py-0.5 px-2">肩</td><td className="text-right px-2">-15%</td>
                      <td className="py-0.5 px-2 pl-6">ミート</td><td className="text-right px-2">-7%</td></tr>
                  <tr><td className="py-0.5 px-2">球速</td><td className="text-right px-2">-10%</td>
                      <td className="py-0.5 px-2 pl-6 text-green-300">制球</td><td className="text-right px-2 text-green-400">-2%</td></tr>
                  <tr><td className="py-0.5 px-2"></td><td className="text-right px-2"></td>
                      <td className="py-0.5 px-2 pl-6 text-green-300">選球眼</td><td className="text-right px-2 text-green-400">ほぼ不変</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2 text-gray-400">
              ※ 捕手のリードは経験で積み上がるので加齢で落ちない。
            </p>
          </Entry>

          <h3 className="text-blue-300 font-bold text-sm border-b border-blue-800 pb-1 mt-6">何が選手の将来を決めるか</h3>
          <Entry title="19歳から7年育てたときの分散分解">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">要因</th><th className="text-right py-1 px-2">説明力</th>
                  <th className="text-left py-1 px-2">効き幅</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-yellow-300 font-bold">18歳時点の能力（素材）</td><td className="text-right px-2">42%</td><td className="px-2">下位25%→上位25% で +18.7</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-300 font-bold">プロ意識</td><td className="text-right px-2">30%</td><td className="px-2">5-30→80-100 で +19.0</td></tr>
                  <tr><td className="py-0.5 px-2">カテゴリ（社会人/独立/クラブ）</td><td className="text-right px-2">8%</td><td className="px-2">—</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">成長率</td><td className="text-right px-2">6.3%</td><td className="px-2">0.6→1.4 で +10.8</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">出場量</td><td className="text-right px-2">5.4%</td><td className="px-2">0打席→300打席 で +12.6</td></tr>
                  <tr><td className="py-0.5 px-2">チームランク</td><td className="text-right px-2">1.2%</td><td className="px-2">—</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              <b className="text-yellow-300">素材とプロ意識が拮抗している。</b>
              「素材下位×意識上位」と「素材上位×意識下位」がほぼ同じ結果になるので、
              プロ意識だけ見ていればいい構造にはなっていない。
            </p>
          </Entry>
          <Entry title="起用は育成でもある">
            <b className="text-yellow-300">試合に出した量そのものが成長に効く。</b>
            20歳・社会人B・プロ意識55の選手を1年育てた実測（6能力の合計の伸び）:
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">年間打席</th>
                  <th className="text-right py-1 px-2">0</th><th className="text-right py-1 px-2">90</th>
                  <th className="text-right py-1 px-2">220</th><th className="text-right py-1 px-2">300</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">1年の伸び</td>
                    <td className="text-right px-2 text-red-400">+5.8</td><td className="text-right px-2">+8.0</td>
                    <td className="text-right px-2">+11.3</td><td className="text-right px-2 text-green-400">+12.7</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              レギュラー起用は控え起用の<b>2.2倍</b>伸びる。
              体幹を先に鍛えるより<b>早く一軍で使うほうが強い</b>——
              レギュラー入りが1年早いことの複利が上回るため。
            </p>
          </Entry>
          <Entry title="プラトーとブレイクスルー">
            成長には年ごとの「充実度」があり、前年を引きずる。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li><b>2年伸び悩んで3年目に化ける</b>／<b>フォームを崩して1年落ちる</b>が起きる</li>
              <li>停滞年 5.4% / 飛躍年 9.4%</li>
              <li>平均は保たれるので、リーグ全体の水準や指名の構成比は動かない</li>
            </ul>
          </Entry>
          <Entry title="カテゴリごとに鍛えられるものが違う">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">所属</th><th className="text-left py-1 px-2">鍛えられるもの</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-1 px-2 text-pink-300 font-bold">大学</td><td className="px-2"><b>総合力</b>。大学ランク（S=1.36〜D=0.85倍）と得意分野で伸びが変わる</td></tr>
                  <tr><td className="py-1 px-2 text-blue-300 font-bold">社会人</td><td className="px-2"><b>技術</b>（制球・ミート・選球眼・守備）。設備・指導者・実戦が揃う</td></tr>
                  <tr><td className="py-1 px-2 text-green-300 font-bold">独立</td><td className="px-2"><b>一芸</b>。長所1つに極端に寄せ、短所は放置</td></tr>
                  <tr><td className="py-1 px-2 text-gray-300 font-bold">クラブ</td><td className="px-2"><b>基礎体力</b>（走・肩・スタミナ）。技術指導者がいないので伸びるかは本人次第</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              <b className="text-yellow-300">一芸型は独立、総合型は社会人</b>が有利という逆転が実際に出る。
              クラブはプロ意識が低いとほとんど伸びない代わりに、
              意識の高い選手は突然変異のように伸びて社会人へ引き上げられることがある。
            </p>
          </Entry>
          <Entry title="加齢によるポジション転向">
            守れる場所は年齢とともに変わる。難しい位置の適性が落ち、移った先の適性が上がる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">元の位置</th><th className="text-right py-1 px-2">転向年齢（中央）</th>
                  <th className="text-right py-1 px-2">実データ</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">捕手</td><td className="text-right px-2">32歳</td><td className="text-right px-2 text-gray-400">32-35</td></tr>
                  <tr><td className="py-0.5 px-2">遊撃 / 中堅 / 二塁</td><td className="text-right px-2">30歳</td><td className="text-right px-2 text-gray-400">30-33</td></tr>
                  <tr><td className="py-0.5 px-2">三塁 / 両翼</td><td className="text-right px-2">31歳</td><td className="text-right px-2 text-gray-400">31-34</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2 text-gray-400">
              中堅→右翼 / 遊撃→三塁 / 三塁→一塁 の順に多い。捕手は3人以上いるときだけ転向する。
            </p>
          </Entry>
        </div>
      );

    case 'career':
      return (
        <div className="space-y-4">
          <Entry title="毎年5,000人の高校3年生が生まれる">
            4月に高校3年生が5,000人生成され、<b>996校・47都道府県</b>に振り分けられる。
            この学年が1年かけてドラフト・進路振り分けを経て球界へ散っていく。
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>校ランクはS〜Fの7段階。才能と校ランクは<b>上下3ランクまで混ざる</b>ので、
                  校名を見ても才能の下限は分からない（S才能の1%はF校から出る）</li>
              <li>能力は独立に引かれず、<b>共通の運動能力因子</b>で相関する。
                  「走攻守そろった逸材」も「全部だめな選手」も出る</li>
              <li>肩力が高い子ほど投手になりやすい（全体の約半分が投手）</li>
              <li><b>沖縄の高校の選手は沖縄の姓を引く</b>（比嘉・金城・大城…）</li>
            </ul>
          </Entry>
          <Entry title="夏の甲子園">
            8月に都道府県予選 → 本戦を消化する。勝ち上がると所属選手の<b>知名度</b>が上がり、
            ドラフト評価とスカウトの発見率に直結する。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>優勝+12 / 出場+3。エース・主砲はさらに上乗せ</li>
              <li>校の戦力＝校ランクの地力＋エースの出来＋打線の厚み。
                  <b>校ランクだけでは決まらない</b></li>
              <li>結果画面の☆から<b>注目選手リスト</b>に登録できる。
                  登録時からの伸び（「球速 128→145」）が追える</li>
            </ul>
          </Entry>
          <Entry title="10月：NPBドラフト">
            高校・大学3〜4年生・社会人・独立の<b>全候補を統一評価</b>し、上位から指名する。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>指名枠は候補の質で動く（<b>年84〜120名</b>）。豊作の年は枠が広がる</li>
              <li>評価 = 能力 × 将来性 + 年齢ボーナス（18歳+33 → 22歳+5 → 28歳-50）+ 知名度×0.3</li>
              <li>年齢帯で見るところが違う。<b>高校生＝素材型</b>（球速・パワー・足・肩）、
                  <b>社会人＝技術型</b>（制球・ミート・守備）</li>
              <li>能力があっても<b>無名だと指名漏れ</b>する。大学・社会人でブレイクして翌年以降に指名、という経路がある</li>
            </ul>
          </Entry>
          <Entry title="下位・育成は「道具を決めてから探す」">
            上位は総合力だが、<b className="text-yellow-300">下位・育成では1つの道具で勝負する選手が並ぶ</b>。
            指名ごとに確率で「探す道具」を1つ引き、その道具の突出度で並べ替える。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">巡目</th>
                  <th className="text-right py-1 px-2">1〜2位</th><th className="text-right py-1 px-2">3位</th>
                  <th className="text-right py-1 px-2">4位</th><th className="text-right py-1 px-2">5位</th>
                  <th className="text-right py-1 px-2">6位〜</th><th className="text-right py-1 px-2">育成</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">一芸指名の確率</td>
                    <td className="text-right px-2">0%</td><td className="text-right px-2">30%</td>
                    <td className="text-right px-2">45%</td><td className="text-right px-2">60%</td>
                    <td className="text-right px-2">75%</td><td className="text-right px-2 text-green-400">80%</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>実際に獲れる水準は 守備90 / 肩97 / 走力96 / リード93 と<b>スバ抜けている</b>
                  （守備60が及第点なので、守備90は figure として立つ）</li>
              <li>守備・肩・リードは<b>守る場所で割り引く</b>ので、守備系の一芸指名は
                  100%がセンターライン（捕遊中二）になる</li>
              <li><b>年上の一芸型には土台も要求する</b>。高卒の素材買いと違い、
                  26歳以上は総合力の重みが上がる</li>
            </ul>
          </Entry>
          <Entry title="指名ラインは年齢とともに上がる">
            <b className="text-yellow-300">若いほど才能、年上ほど実績。</b>
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">年齢</th>
                  <th className="text-right py-1 px-2">上位指名の下限</th>
                  <th className="text-right py-1 px-2">下位・育成の下限</th>
                  <th className="text-right py-1 px-2">評価点（中央）</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2">18歳</td><td className="text-right px-2">70.3</td><td className="text-right px-2">54.4</td><td className="text-right px-2">282</td></tr>
                  <tr><td className="py-0.5 px-2">22歳</td><td className="text-right px-2">82.2</td><td className="text-right px-2">68.1</td><td className="text-right px-2">279</td></tr>
                  <tr><td className="py-0.5 px-2">27歳</td><td className="text-right px-2">75.6</td><td className="text-right px-2">71.1</td><td className="text-right px-2 text-red-400">202</td></tr>
                  <tr><td className="py-0.5 px-2">29歳</td><td className="text-right px-2 text-red-400">104.4</td><td className="text-right px-2">74.8</td><td className="text-right px-2 text-red-400">185</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-2">
              評価点は逆に下がる（282→185）。同じ点を取るのに27歳は年齢ボーナスを失うので、
              <b>必要な能力は上がる</b>。プロ意識の低い選手は18歳では上位指名圏にいるのに、
              22歳でラインに置いていかれる。
            </p>
          </Entry>
          <Entry title="オフシーズン：ドラフト漏れの進路振り分け">
            5,000人のおおよその内訳。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">進路</th><th className="text-right py-1 px-2">人数</th>
                  <th className="text-right py-1 px-2">割合</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-pink-300">NPB指名</td><td className="text-right px-2">約20名</td><td className="text-right px-2">0.4%</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-300">大学</td><td className="text-right px-2">約2,230名</td><td className="text-right px-2">44.6%</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">社会人</td><td className="text-right px-2">約127名</td><td className="text-right px-2">2.5%</td></tr>
                  <tr><td className="py-0.5 px-2 text-orange-300">独立</td><td className="text-right px-2">約123名</td><td className="text-right px-2">2.5%</td></tr>
                  <tr><td className="py-0.5 px-2 text-gray-300">引退</td><td className="text-right px-2">約2,500名</td><td className="text-right px-2">50%</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>同じ水準の中では<b>形</b>で分かれる。総合力に優れる選手は大学・社会人へ、
                  <b>一芸型は独立</b>へ流れる（尖り 大学1.29 / 社会人1.32 / <b>独立2.22</b>）</li>
              <li>4年待てない即戦力志向の選手は、大学ではなく独立を選ぶことがある</li>
            </ul>
          </Entry>
          <Entry title="地元の高校生は地元のチームへ行きやすい">
            出身県を<b>12地区</b>に畳んで突き合わせる。無作為なら8.5%のところ——
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">進路</th><th className="text-right py-1 px-2">出身と同じ地区</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-blue-300">大学</td><td className="text-right px-2 text-green-400">47.5%</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-300">社会人</td><td className="text-right px-2 text-green-400">40.0%</td></tr>
                  <tr><td className="py-0.5 px-2 text-orange-300">独立</td><td className="text-right px-2 text-green-400">38.6%</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>地元率は地区で違う。<b>東京69% / 近畿64%</b>（受け入れ先が多い）に対し、
                  <b>北信越24% / 四国31%</b>（大学6校しかない）</li>
              <li>地元を除くと<b>どの地区からも東京への流出が最大</b>（13〜22%）</li>
              <li>チーム戦力は歪まない（地区間の差はむしろ縮む）</li>
            </ul>
          </Entry>
          <Entry title="教え子のプロキャリア（OB名鑑）">
            ドラフトで送り出した選手は毎年1シーズンずつプロで進む。
            資料室の「OB名鑑」で現況と通算成績が追える。
            <ul className="list-disc list-inside text-sm space-y-1 mt-1">
              <li>一軍・レギュラーは<b>絶対的な能力の線ではなく現役の中の順位</b>で決まる（椅子取り）</li>
              <li>実測: 一軍到達44〜48% / レギュラー到達15〜16%（実NPB 40〜50% / 15〜20%）</li>
              <li><b>1年目からレギュラーになる選手もいる</b>（学年あたり3.9〜5.3人）。
                  即戦力（社会人・独立）が最も早く、高卒が最も遅い。
                  高卒の1年目レギュラーは学年あたり0.27人で、全員ドラフト1位</li>
              <li>二軍が続くと戦力外。<b>プロは操作できない</b>——
                  遊べるようにするとドラフトが単なる移籍になり、送り出す重みが失われる</li>
            </ul>
          </Entry>
        </div>
      );

    case 'gameflow':
      return (
        <div className="space-y-4">
          <Entry title="どのモードでも「1つの日本球界」が動いている">
            どのモードで始めても、独立26・社会人300・大学234の全カテゴリが生成され、
            選手プール（高校生・大学・リリース）も共有される。
            <b className="text-yellow-300">モードの違いは「どのチームを操作し、どのカレンダーで進むか」だけ</b>。
            <p className="text-sm mt-2">オフシーズンの「監督移籍」で別カテゴリのチームへ移ることもできる。</p>
          </Entry>
          <Entry title="独立リーグモード">
            <ol className="list-decimal list-inside text-sm space-y-1 mt-1">
              <li>レギュレーション設定 → <b>トライアウト</b>（24人ドラフト）→ キャンプ</li>
              <li>4月: 高校3年生5,000人が生成される</li>
              <li>レギュラーシーズン（日付進行で消化）→ プレーオフ</li>
              <li>10月: <b>NPBドラフト</b>（チーム選手＋高校生から指名）</li>
              <li>11/9 契約更改 → 11/10 トライアウト</li>
              <li>オフシーズン（表彰・引退・高校生の進路振り分け）→ Year 2へ</li>
            </ol>
          </Entry>
          <Entry title="社会人モード">
            <ol className="list-decimal list-inside text-sm space-y-1 mt-1">
              <li>企業チーム選択 → キャンプ</li>
              <li>4月: 高校3年生生成（スカウト対象になる）</li>
              <li>レギュラーシーズン → <b>都市対抗予選</b>（6月）→ <b>都市対抗本戦</b>（8月）</li>
              <li>10月: NPBドラフト → 11月: 日本選手権</li>
              <li>11/9 <b>退団</b> → 11/10 <b>スカウト入団</b>（スカウトの眼で能力がぼける）</li>
              <li>オフシーズン → Year 2へ</li>
            </ol>
          </Entry>
          <Entry title="大学モード">
            <ol className="list-decimal list-inside text-sm space-y-1 mt-1">
              <li>大学チーム選択 → キャンプ</li>
              <li>春季リーグ（4-6月）→ <b>全日本大学選手権</b>（6月）</li>
              <li>秋季リーグ（9-11月）→ <b>明治神宮大会</b>（11月）</li>
              <li>10月: NPBドラフト → 11/10: <b>スポーツ推薦スカウト</b></li>
              <li>オフシーズン（卒業＋入部）→ Year 2へ</li>
            </ol>
            <p className="text-sm mt-2">
              推薦スカウトはシーズン通年で動かせる。<b>低ランク大学ほど、
              無名の逸材を早期に発掘して注目を続け、交渉率を上げてから確保する</b>のが要になる。
            </p>
          </Entry>
          <Entry title="チームランクは勝てば上がる">
            全カテゴリのチームがEloスコアを持ち、年度末に全体のパーセンタイルでランクが決まる。
            <div className="bg-gray-700/50 rounded-lg p-2 mt-2">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-300 border-b border-gray-600">
                  <th className="text-left py-1 px-2">ランク</th>
                  <th className="text-right py-1 px-2">S</th><th className="text-right py-1 px-2">A</th>
                  <th className="text-right py-1 px-2">B</th><th className="text-right py-1 px-2">C</th>
                  <th className="text-right py-1 px-2">D</th>
                </tr></thead>
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-green-300">全体での位置</td>
                    <td className="text-right px-2">上位4%</td><td className="text-right px-2">5-12%</td>
                    <td className="text-right px-2">13-28%</td><td className="text-right px-2">29-56%</td>
                    <td className="text-right px-2">下位44%</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
              <li>Eloが動く場面: リーグ戦の勝率・最終順位（1位+30）・地域大会・都市対抗予選・
                  全国大会・<b>プロ輩出（1名+15）</b></li>
              <li><b>下位リーグでも優勝すれば昇格できる</b>ように、順位ボーナスを厚くしてある</li>
              <li>実測: 地区大会を毎年勝つDランクのチームは<b>1〜6年（中央3年）でCへ</b>、
                  さらに3〜8年でBへ。背景のCPUチームは10年で16%が昇格</li>
              <li><b>注目度（reputation）はランクとは別系統</b>。
                  スカウト・予算・入団交渉の成功率にだけ効く</li>
            </ul>
          </Entry>
          <Entry title="能力値ランク">
            <div className="bg-gray-700/50 rounded-lg p-2 mt-1">
              <table className="w-full text-sm">
                <tbody className="text-gray-300">
                  <tr><td className="py-0.5 px-2 text-pink-400 font-bold">S</td><td className="px-2">90〜99</td><td className="px-2 text-gray-300">超一流</td></tr>
                  <tr><td className="py-0.5 px-2 text-red-400 font-bold">A</td><td className="px-2">80〜89</td><td className="px-2 text-gray-300">一流</td></tr>
                  <tr><td className="py-0.5 px-2 text-orange-400 font-bold">B</td><td className="px-2">70〜79</td><td className="px-2 text-gray-300">好選手</td></tr>
                  <tr><td className="py-0.5 px-2 text-yellow-400 font-bold">C</td><td className="px-2">60〜69</td><td className="px-2 text-gray-300">平均以上</td></tr>
                  <tr><td className="py-0.5 px-2 text-green-400 font-bold">D</td><td className="px-2">50〜59</td><td className="px-2 text-gray-300">平均的</td></tr>
                  <tr><td className="py-0.5 px-2 text-blue-400 font-bold">E</td><td className="px-2">40〜49</td><td className="px-2 text-gray-300">やや劣る</td></tr>
                  <tr><td className="py-0.5 px-2 text-gray-300 font-bold">F</td><td className="px-2">1〜39</td><td className="px-2 text-gray-300">苦手</td></tr>
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
      {range && <span className="text-xs text-gray-300 bg-gray-600/60 px-1.5 py-0.5 rounded">{range}</span>}
    </div>
    <div className="text-gray-300 text-sm leading-relaxed">{children}</div>
  </div>
);

const ManualScreen = ({ onBack }) => {
  const [selectedCategory, setSelectedCategory] = useState('batting');

  return (
    <ScreenShell width="mid" className="text-white">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">MANUAL</h1>
            <span className="text-gray-300 text-sm">～ゲーム辞典～</span>
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
                      ? 'seg-on font-bold' : 'seg'
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
    </ScreenShell>
  );
};

export default ManualScreen;
