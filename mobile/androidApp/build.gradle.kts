import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    kotlin("android")
    kotlin("plugin.compose")
}

android {
    namespace = "jp.icenorth.baseball.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "jp.icenorth.baseball.online"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        // 本番のオンライン対人版（docs/online/PRODUCTION_SETUP.md の「本番」）
        buildConfigField("String", "DEFAULT_ENDPOINT", "\"https://baseball-simulation-neon.vercel.app/api/online\"")
    }

    // ⚠ 試作の配布用に、署名鍵をリポジトリに置いてある（debug.keystore、パスワードは Android 標準の android）。
    //    CI のたびに鍵が変わると、端末で「上書きインストールできない」になるため。
    //    ストアに出すときは本番用の鍵を別に作り、リポジトリには置かないこと。
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/INDEX.LIST", "/META-INF/io.netty.versions.properties")
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":shared"))

    val composeBom = platform("androidx.compose:compose-bom:2025.08.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    // 長押しドラッグでの並べ替え（LazyColumn 用）
    implementation("sh.calvin.reorderable:reorderable:2.5.1")
}
