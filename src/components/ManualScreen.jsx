import React, { useState } from 'react';

const CATEGORIES = [
  { id: 'batting', label: '打撃能力' },
  { id: 'physical', label: '身体能力' },
  { id: 'fielding', label: '守備能力' },
  { id: 'pitching', label: '投手能力' },
  { id: 'condition', label: 'コンディション' },
  { id: 'fitness', label: '守備位置適性' },
  { id: 'pitchRoles', label: '投手起用ロール' },
  { id: 'pitchSubstitution', label: '降板ルール' },
  { id: 'traits', label: '選手特性' },
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
          <Entry title="エース（ace）" range="球数上限: 110球">
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
                  <tr><td className="py-0.5 px-2 text-blue-300">エース</td><td className="text-right px-2">110球</td></tr>
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
