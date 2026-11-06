// オンライン対人モードのスマホアプリ（Android）。
// サーバー（../server, ../api）はそのまま使い、ここは「見る・指示を送る」だけの画面。
//
// - shared     : 通信・データの形・表示用の関数（Kotlin Multiplatform。将来 iOS でも使う）
// - androidApp : Jetpack Compose の画面
//
// ⚠ `-PsharedOnly` を付けると androidApp を外す。Android SDK や Google の
//    Maven に届かない環境（クラウドの作業環境など）でも shared の検査を回すため。
pluginManagement {
    repositories {
        google {
            // Google の Maven は Android 関係だけに使う（他の依存まで問い合わせない）
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        kotlin("multiplatform") version "2.2.21"
        kotlin("android") version "2.2.21"
        kotlin("plugin.serialization") version "2.2.21"
        kotlin("plugin.compose") version "2.2.21"
        id("com.android.application") version "8.13.0"
    }
}

dependencyResolutionManagement {
    repositories {
        google {
            // Google の Maven は Android 関係だけに使う（他の依存まで問い合わせない）
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
    }
}

rootProject.name = "baseball-online"
include(":shared")
if (!providers.gradleProperty("sharedOnly").isPresent) include(":androidApp")
