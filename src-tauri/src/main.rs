// En release no abre una consola junto a la ventana en Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sonaura_lib::run()
}
