// ============================================
// ツチノート — ランディングページ（未ログイン時トップ）
// ============================================

var LandingPage = (function() {
  'use strict';

  function render() {
    return '' +
      '<div class="lp">' +

        '<div class="lp-header">' +
          '<div class="lp-header__inner">' +
            '<span class="lp-header__logo">ツチノート</span>' +
            '<div class="lp-header__actions">' +
              '<a href="#/login" class="lp-link">ログイン</a>' +
              '<a href="#/register" class="btn btn-primary btn-sm">はじめる</a>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // ヒーロー
        '<section class="lp-hero">' +
          '<div class="lp-sprouts">' +
            '<div class="lp-sprout"><div class="lp-sprout__fruit">&#127803;</div><div class="lp-sprout__leaves"><div class="lp-sprout__leaf"></div><div class="lp-sprout__leaf lp-sprout__leaf--r"></div></div><div class="lp-sprout__stem"></div></div>' +
            '<div class="lp-sprout"><div class="lp-sprout__fruit"></div><div class="lp-sprout__leaves"><div class="lp-sprout__leaf"></div><div class="lp-sprout__leaf lp-sprout__leaf--r"></div></div><div class="lp-sprout__stem"></div></div>' +
            '<div class="lp-sprout"><div class="lp-sprout__fruit">&#127813;</div><div class="lp-sprout__leaves"><div class="lp-sprout__leaf"></div><div class="lp-sprout__leaf lp-sprout__leaf--r"></div></div><div class="lp-sprout__stem"></div></div>' +
            '<div class="lp-sprout"><div class="lp-sprout__fruit">&#127799;</div><div class="lp-sprout__leaves"><div class="lp-sprout__leaf"></div><div class="lp-sprout__leaf lp-sprout__leaf--r"></div></div><div class="lp-sprout__stem"></div></div>' +
            '<div class="lp-sprout"><div class="lp-sprout__fruit">&#129365;</div><div class="lp-sprout__leaves"><div class="lp-sprout__leaf"></div><div class="lp-sprout__leaf lp-sprout__leaf--r"></div></div><div class="lp-sprout__stem"></div></div>' +
            '<div class="lp-sprout"><div class="lp-sprout__fruit"></div><div class="lp-sprout__leaves"><div class="lp-sprout__leaf"></div><div class="lp-sprout__leaf lp-sprout__leaf--r"></div></div><div class="lp-sprout__stem"></div></div>' +
          '</div>' +
          '<div class="lp-hero__inner">' +
            '<h1 class="lp-hero__catch">' +
              '撮って、聞いて、育てる。<br>' +
              '<span class="lp-hero__em">畑のことは、ぜんぶおまかせ。</span>' +
            '</h1>' +
            '<p class="lp-hero__sub">' +
              'カメラで撮るだけで土や葉の状態を診断。<br>' +
              '天気にあわせた作業提案、育て方ガイド、記録まで。<br>' +
              '家庭菜園のことは、ツチノートひとつで。' +
            '</p>' +
            '<div class="lp-hero__cta">' +
              '<a href="#/register" class="btn btn-primary btn-lg" aria-label="無料で新規登録する">無料ではじめる</a>' +
            '</div>' +
            '<p class="lp-hero__note">カード登録なし・すぐ使えます</p>' +
          '</div>' +
        '</section>' +

        // できること
        '<section class="lp-section lp-section--features">' +
          '<h2 class="lp-section__title">ツチノートにできること</h2>' +
          '<div class="lp-features">' +
            '<div class="lp-feature">' +
              '<p class="lp-feature__label">カメラ診断</p>' +
              '<p class="lp-feature__title">撮るだけで、土と作物の状態がわかる</p>' +
              '<p class="lp-feature__desc">スマホで土や葉っぱを撮影するだけ。「水不足気味」「窒素が足りてない」「うどんこ病の兆候あり」など、写真から状態を診断します。</p>' +
            '</div>' +
            '<div class="lp-feature">' +
              '<p class="lp-feature__label">生育トラッキング</p>' +
              '<p class="lp-feature__title">成長の記録を、写真で自動比較</p>' +
              '<p class="lp-feature__desc">定期的に撮った写真から生育の進み具合を自動で判定。「先週より葉が大きくなってます」「そろそろ実がつく頃です」と教えてくれます。</p>' +
            '</div>' +
            '<div class="lp-feature">' +
              '<p class="lp-feature__label">天気</p>' +
              '<p class="lp-feature__title">畑のピンポイント天気予報</p>' +
              '<p class="lp-feature__desc">畑の場所にあわせた天気・気温・降水確率を毎朝お届け。「明日雨だから今日のうちに収穫しよう」がすぐ分かります。</p>' +
            '</div>' +
            '<div class="lp-feature">' +
              '<p class="lp-feature__label">提案</p>' +
              '<p class="lp-feature__title">写真×天気×作物データで、今日やることを提案</p>' +
              '<p class="lp-feature__desc">「葉が黄色くなってきてます。明日雨なので、今日追肥しておきましょう」——カメラの診断結果と天気を掛け合わせた、あなたの畑だけの提案が届きます。</p>' +
            '</div>' +
            '<div class="lp-feature">' +
              '<p class="lp-feature__label">育て方</p>' +
              '<p class="lp-feature__title">野菜ごとの育て方ガイド</p>' +
              '<p class="lp-feature__desc">トマト、きゅうり、なす…登録した作物に合わせて、植え付けから収穫までの育て方を段階ごとにナビゲート。初心者でも迷いません。</p>' +
            '</div>' +
            '<div class="lp-feature">' +
              '<p class="lp-feature__label">記録</p>' +
              '<p class="lp-feature__title">写真・天気・作業がまとめて残る</p>' +
              '<p class="lp-feature__desc">撮った写真と天気データが作業記録に自動で紐づく。「去年の今頃、畑はどんな状態だった？」が写真付きで振り返れます。</p>' +
            '</div>' +
          '</div>' +
        '</section>' +

        // 悩み
        '<section class="lp-section">' +
          '<h2 class="lp-section__title">こんな経験、ありませんか？</h2>' +
          '<ul class="lp-problem-list">' +
            '<li class="lp-problem-list__item">' +
              '<strong>水やりのタイミング</strong> — 昨日たっぷりあげたのに今日は大雨。逆に晴れ続きで気づいたら枯れてた。' +
            '</li>' +
            '<li class="lp-problem-list__item">' +
              '<strong>育て方がわからない</strong> — トマトの脇芽って取るの？追肥っていつ？ネットで調べるたびに情報がバラバラ。' +
            '</li>' +
            '<li class="lp-problem-list__item">' +
              '<strong>葉っぱの異変に気づけない</strong> — 黄色くなってるけど病気？栄養不足？見ただけじゃ判断できない。' +
            '</li>' +
            '<li class="lp-problem-list__item">' +
              '<strong>記録が続かない</strong> — 去年いつトマト植えたっけ。ノートに書いたはずなのに見つからない。' +
            '</li>' +
            '<li class="lp-problem-list__item">' +
              '<strong>優先順位がわからない</strong> — 週末しか畑に行けない。やることが多すぎて何から手をつけるか毎回迷う。' +
            '</li>' +
          '</ul>' +
          '<p class="lp-problem-footer">ツチノートは、こういう困りごとを天気も育て方もまとめて引き受けます。</p>' +
        '</section>' +

        // 使い方
        '<section class="lp-section lp-section--pale">' +
          '<h2 class="lp-section__title">使い方</h2>' +
          '<p class="lp-section__lead">登録して畑の場所を入れたら、あとは毎朝アプリを開くだけ。</p>' +
          '<div class="lp-steps">' +
            '<div class="lp-step">' +
              '<div class="lp-step__num">1</div>' +
              '<div class="lp-step__body">' +
                '<p class="lp-step__title">畑と育てる野菜を登録</p>' +
                '<p class="lp-step__desc">位置情報で畑の場所を設定。育てている野菜を選ぶと、その作物に合わせたサポートが始まります。</p>' +
              '</div>' +
            '</div>' +
            '<div class="lp-step">' +
              '<div class="lp-step__num">2</div>' +
              '<div class="lp-step__body">' +
                '<p class="lp-step__title">毎朝、天気と今日やることが届く</p>' +
                '<p class="lp-step__desc">天気予報と、作物の生育段階に合わせた作業提案がセットで届きます。水やり、追肥、収穫…判断はおまかせ。</p>' +
              '</div>' +
            '</div>' +
            '<div class="lp-step">' +
              '<div class="lp-step__num">3</div>' +
              '<div class="lp-step__body">' +
                '<p class="lp-step__title">やったことをポチッと記録</p>' +
                '<p class="lp-step__desc">天気と一緒に残るから、来年「去年どうだったっけ？」がすぐ分かります。育て方のコツが自然と身につきます。</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</section>' +

        // 声
        '<section class="lp-section">' +
          '<h2 class="lp-section__title">使っている人の声</h2>' +
          '<p class="lp-section__lead">ベータ版テスターの方からいただいた感想です</p>' +
          '<div class="lp-voices">' +
            '<div class="lp-voice">' +
              '<p class="lp-voice__text">「葉っぱの色がおかしいと思って撮ったら、窒素不足って出た。追肥したら数日で元気になって感動した。」</p>' +
              '<p class="lp-voice__author">— 20代・家庭菜園はじめて3ヶ月</p>' +
            '</div>' +
            '<div class="lp-voice">' +
              '<p class="lp-voice__text">「天気と作業提案がセットで出てくるのがちょうどいい。朝コーヒー飲みながらチェックするのが日課になった。」</p>' +
              '<p class="lp-voice__author">— 60代・週末菜園歴8年</p>' +
            '</div>' +
            '<div class="lp-voice">' +
              '<p class="lp-voice__text">「去年の記録が天気付きで残ってるのが地味にすごい。追肥のタイミングとか、今年はバッチリだった。」</p>' +
              '<p class="lp-voice__author">— 40代・家庭菜園歴3年</p>' +
            '</div>' +
          '</div>' +
        '</section>' +

        // 料金
        '<section class="lp-section lp-section--pale">' +
          '<h2 class="lp-section__title">料金</h2>' +
          '<p class="lp-section__lead">基本は無料。もうちょっと使いたくなったらLight、しっかり使うならProへ。</p>' +
          '<div class="lp-pricing">' +
            '<div class="lp-plan">' +
              '<p class="lp-plan__name">Free</p>' +
              '<p class="lp-plan__price">&yen;0<span class="lp-plan__unit">/月</span></p>' +
              '<ul class="lp-plan__list">' +
                '<li>&#10003; 畑1つまで</li>' +
                '<li>&#10003; 天気予報・作業提案</li>' +
                '<li>&#10003; 育て方ガイド</li>' +
                '<li>&#10003; 作業記録（直近30日）</li>' +
              '</ul>' +
              '<a href="#/register" class="btn btn-outline btn-block">無料ではじめる</a>' +
            '</div>' +
            '<div class="lp-plan">' +
              '<p class="lp-plan__name">Light</p>' +
              '<p class="lp-plan__price">&yen;100<span class="lp-plan__unit">/月</span></p>' +
              '<ul class="lp-plan__list">' +
                '<li>&#10003; 畑3つまで</li>' +
                '<li>&#10003; 天気予報・作業提案</li>' +
                '<li>&#10003; 育て方ガイド</li>' +
                '<li>&#10003; 作業記録（無制限）</li>' +
              '</ul>' +
              '<a href="#/register" class="btn btn-outline btn-block">Lightではじめる</a>' +
            '</div>' +
            '<div class="lp-plan lp-plan--rec">' +
              '<span class="lp-plan__badge">おすすめ</span>' +
              '<p class="lp-plan__name">Pro</p>' +
              '<p class="lp-plan__price">&yen;300<span class="lp-plan__unit">/月</span></p>' +
              '<ul class="lp-plan__list">' +
                '<li>&#10003; 畑5つまで</li>' +
                '<li>&#10003; くわしい作業提案</li>' +
                '<li>&#10003; 作業記録（無制限）</li>' +
                '<li>&#10003; 週間カレンダー</li>' +
                '<li>&#10003; 記録エクスポート</li>' +
              '</ul>' +
              '<a href="#/register" class="btn btn-primary btn-block">Proではじめる</a>' +
            '</div>' +
          '</div>' +
        '</section>' +

        // CTA
        '<section class="lp-cta">' +
          '<h2 class="lp-cta__title">種まきから収穫まで、<br>ツチノートがそばにいます。</h2>' +
          '<p class="lp-cta__sub">無料プランですぐ始められます。</p>' +
          '<a href="#/register" class="btn btn-primary btn-lg">無料ではじめる</a>' +
        '</section>' +

        '<div class="lp-footer">' +
          '<p>ツチノート — 濱田礼</p>' +
          '<div style="margin-top:8px;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">' +
            '<a href="terms.html" style="color:var(--text-light);font-size:0.75rem;">利用規約</a>' +
            '<a href="privacy.html" style="color:var(--text-light);font-size:0.75rem;">プライバシーポリシー</a>' +
            '<a href="legal.html" style="color:var(--text-light);font-size:0.75rem;">特定商取引法に基づく表記</a>' +
            '<a href="contact.html" style="color:var(--text-light);font-size:0.75rem;">お問い合わせ</a>' +
          '</div>' +
        '</div>' +

      '</div>';
  }

  function bind() {
    // バインドなし
  }

  return {
    render: render,
    bind: bind
  };
})();
