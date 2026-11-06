plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
}

// ⚠ **Android 用の target は置かない**。Android アプリは jvm の成果物をそのまま使える。
//    Android の Gradle プラグインに頼らないので、SDK の無い環境でも検査が回る。
//    iOS に進むときは iosArm64() / iosSimulatorArm64() を足し、通信エンジンを分ける。
kotlin {
    // ⚠ toolchain は指定しない（JDK のダウンロードが要るため）。手元の JDK で 17 向けに出す
    jvm {
        compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
    }
    sourceSets {
        commonMain.dependencies {
            implementation("io.ktor:ktor-client-core:3.3.3")
            api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
            api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
        }
        jvmMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:3.3.3")
        }
        jvmTest.dependencies {
            implementation(kotlin("test"))
            implementation("io.ktor:ktor-client-mock:3.3.3")
        }
    }
}
