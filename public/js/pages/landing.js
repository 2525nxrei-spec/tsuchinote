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

        '<section class="lp-hero">' +
          '<h1 class="lp-hero__catch">' +
            '「明日、雨だっけ？」を<br>' +
            '<span class="lp-hero__em">畑のそばで、毎朝。</span>' +
          '</h1>' +
          '<p class="lp-hero__sub">' +
            '天気を見て、今日やることを教えてくれる。<br>' +
            '水やりのタイミングも、収穫どきも、もう迷わない。<br>' +
            '家庭菜園がちょっとラクになるアプリです。' +
          '</p>' +
          '<div class="lp-hero__cta">' +
            '<a href="#/register" class="btn btn-primary btn-lg">無料ではじめる</a>' +
          '</div>' +
          '<p class="lp-hero__note">カード登録なし・すぐ使えます</p>' +
        '</section>' +

        '<section class="lp-section">' +
          '<h2 class="lp-section__title">こんな経験、ありませんか？</h2>' +
          '<ul class="lp-problem-list">' +
            '<li class="lp-problem-list__item">' +
              '<strong>水やりのタイミング</strong> — 昨日たっぷりあげたのに今日は大雨。逆に晴れ続きで気づいたら枯れてた。' +
            '</li>' +
            '<li class="lp-problem-list__item">' +
              '<strong>記録が続かない</strong> — 去年いつトマト植えたっけ。ノートに書いたはずなのに見つからない。' +
            '</li>' +
            '<li class="lp-problem-list__item">' +
              '<strong>優先順位がわからない</strong> — 週末しか畑に行けない。やることが多すぎて何から手をつけるか毎回迷う。' +
            '</li>' +
            '<li class="lp-problem-list__item">' +
              '<strong>天気の読み違い</strong> — 暑すぎて枯れた、霜でダメになった。天気をちゃんと見ておけばよかった。' +
            '</li>' +
          '</ul>' +
          '<p class="lp-problem-footer">ツチノートは、こういう「ちょっとした困りごと」をまとめて引き受けます。</p>' +
        '</section>' +

        '<section class="lp-section lp-section--pale">' +
          '<h2 class="lp-section__title">使い方</h2>' +
          '<p class="lp-section__lead">登録して畑の場所を入れたら、あとは毎朝アプリを開くだけ。</p>' +
          '<div class="lp-steps">' +
            '<div class="lp-step">' +
              '<div class="lp-step__num">1</div>' +
              '<div class="lp-step__body">' +
                '<p class="lp-step__title">畑の場所を入れる</p>' +
                '<p class="lp-step__desc">住所を入力するだけ。その畑のピンポイント天気が届きます。</p>' +
              '</div>' +
            '</div>' +
            '<div class="lp-step">' +
              '<div class="lp-step__num">2</div>' +
              '<div class="lp-step__body">' +
                '<p class="lp-step__title">毎朝、今日やることが届く</p>' +
                '<p class="lp-step__desc">「水やりした方がいい」「今日は収穫日和」みたいな提案が来ます。</p>' +
              '</div>' +
            '</div>' +
            '<div class="lp-step">' +
              '<div class="lp-step__num">3</div>' +
              '<div class="lp-step__body">' +
                '<p class="lp-step__title">やったことをポチッと記録</p>' +
                '<p class="lp-step__desc">天気と一緒に残るから、来年の参考になります。</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="lp-section">' +
          '<h2 class="lp-section__title">使っている人の声</h2>' +
          '<p class="lp-section__lead">ベータ版テスターの方からいただいた感想です</p>' +
          '<div class="lp-voices">' +
            '<div class="lp-voice">' +
              '<p class="lp-voice__text">「朝コーヒー飲みながら今日やること確認するのが習慣になった。天気とセットで出てくるのがちょうどいい。」</p>' +
              '<p class="lp-voice__author">— 60代・週末菜園歴8年</p>' +
            '</div>' +
            '<div class="lp-voice">' +
              '<p class="lp-voice__text">「水やりのタイミングが分からなかったけど、雨の前は止めてって教えてくれるから助かってる。」</p>' +
              '<p class="lp-voice__author">— 30代・ベランダ菜園1年目</p>' +
            '</div>' +
            '<div class="lp-voice">' +
              '<p class="lp-voice__text">「去年の記録が天気付きで残ってるのが地味にすごい。植え付け時期の参考になった。」</p>' +
              '<p class="lp-voice__author">— 40代・家庭菜園歴3年</p>' +
            '</div>' +
          '</div>' +
        '</section>' +

        '<section class="lp-section lp-section--pale">' +
          '<h2 class="lp-section__title">料金</h2>' +
          '<p class="lp-section__lead">基本は無料。もうちょっと使いたくなったらProへ。</p>' +
          '<div class="lp-pricing">' +
            '<div class="lp-plan">' +
              '<p class="lp-plan__name">Free</p>' +
              '<p class="lp-plan__price">&yen;0<span class="lp-plan__unit">/月</span></p>' +
              '<ul class="lp-plan__list">' +
                '<li>&#10003; 畑1つまで</li>' +
                '<li>&#10003; 毎日の天気予報</li>' +
                '<li>&#10003; 今日の作業提案</li>' +
                '<li>&#10003; 作業記録（直近30日）</li>' +
              '</ul>' +
              '<a href="#/register" class="btn btn-outline btn-block">無料ではじめる</a>' +
            '</div>' +
            '<div class="lp-plan lp-plan--rec">' +
              '<span class="lp-plan__badge">おすすめ</span>' +
              '<p class="lp-plan__name">Pro</p>' +
              '<p class="lp-plan__price">&yen;100<span class="lp-plan__unit">/月</span></p>' +
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

        '<section class="lp-cta">' +
          '<h2 class="lp-cta__title">明日の畑仕事、<br>ツチノートに聞いてみませんか。</h2>' +
          '<p class="lp-cta__sub">無料プランですぐ始められます。</p>' +
          '<a href="#/register" class="btn btn-primary btn-lg">無料ではじめる</a>' +
        '</section>' +

        '<div class="lp-footer">' +
          '<p>ツチノート — 礼株式会社</p>' +
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
