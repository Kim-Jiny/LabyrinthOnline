# Socket.IO / Engine.IO
-keep class io.socket.** { *; }
-dontwarn io.socket.**

# kotlinx.serialization — @Serializable 모델 직렬화기 보존
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.jiny.labyrinthonline.** {
    *** Companion;
}
-keepclasseswithmembers class com.jiny.labyrinthonline.** {
    kotlinx.serialization.KSerializer serializer(...);
}
